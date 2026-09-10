// ============================================================
// Aletsch AI — Analysis Runner
// Background pipeline: fetch files → AST parse → store results
// ============================================================

import { getDb } from "./mongodb";
import { parseGitHubUrl, getRawFileContent } from "./github";
import { parseFile } from "./ast/interaction-detector";
import { extractRoutes } from "./ast/route-detector";
import { ObjectId } from "mongodb";
import { fallbackStore } from "./fallback-store";

// File extensions to analyze
const ANALYZABLE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

// Paths to skip
const SKIP_PATTERNS = [
  "node_modules/",
  ".next/",
  "dist/",
  "build/",
  ".git/",
  "coverage/",
  "__tests__/",
  ".test.",
  ".spec.",
  ".stories.",
  "public/",
  ".min.js",
  ".d.ts",
];

function shouldAnalyzeFile(filePath: string): boolean {
  const ext = "." + filePath.split(".").pop();
  if (!ANALYZABLE_EXTENSIONS.includes(ext)) return false;
  if (SKIP_PATTERNS.some((p) => filePath.includes(p))) return false;
  return true;
}

export async function runBackgroundAnalysis(projectId: string, jobId: string) {
  console.log(`[Analysis] Starting for project: ${projectId}, job: ${jobId}`);

  if (!process.env.MONGODB_URI) {
    console.warn("[Analysis] MONGODB_URI not set — skipping.");
    return;
  }

  let db: Awaited<ReturnType<typeof getDb>>;
  try {
    db = await getDb();
  } catch (e) {
    console.error("[Analysis] Cannot connect to MongoDB:", e);
    return;
  }

  let jobObjectId: ObjectId;
  let projectObjectId: ObjectId;

  try {
    jobObjectId = new ObjectId(jobId);
    projectObjectId = new ObjectId(projectId);
  } catch {
    console.error("[Analysis] Invalid jobId or projectId format");
    return;
  }

  const updateJob = async (data: Record<string, unknown>) => {
    try {
      await db.collection("analysisJobs").updateOne({ _id: jobObjectId }, { $set: data });
    } catch { /* ignore */ }
  };

  try {
    await updateJob({ status: "running", progress: 5, currentStep: "Connecting to repository..." });

    // ── 1. Load project ──────────────────────────────────────
    const project = await db.collection("projects").findOne({ _id: projectObjectId });
    if (!project) throw new Error("Project not found in database.");

    const { owner, repo } = parseGitHubUrl(project.repositoryUrl);
    const branch = project.branch || "main";

    await updateJob({ progress: 10, currentStep: "Loading indexed source file list..." });

    // ── 2. Fetch stored sourceFiles ──────────────────────────
    const allSourceFiles = await db.collection("sourceFiles").find({ projectId }).toArray();

    // Filter to analyzable files only
    const sourceFilesToAnalyze = allSourceFiles.filter((f) => shouldAnalyzeFile(f.path));

    // Cap at 50 files to stay within GitHub rate limits
    const filesToProcess = sourceFilesToAnalyze.slice(0, 50);
    const totalFiles = filesToProcess.length;

    if (totalFiles === 0) {
      await updateJob({
        status: "completed",
        progress: 100,
        currentStep: "No analyzable source files found.",
        completedAt: new Date().toISOString(),
      });
      await db.collection("projects").updateOne({ _id: projectObjectId }, { $set: { status: "Ready" } });
      return;
    }

    await updateJob({ progress: 15, currentStep: `Found ${totalFiles} source files to analyze. Fetching content...` });

    // ── 3. Fetch & parse each file ───────────────────────────
    const allFilePaths: string[] = [];
    const fileResults: ReturnType<typeof parseFile>[] = [];
    const fetchErrors: Array<{ filePath: string; error: string }> = [];

    for (let i = 0; i < totalFiles; i++) {
      const file = filesToProcess[i];
      const progressPct = Math.round(15 + (i / totalFiles) * 55); // 15% → 70%

      await updateJob({
        progress: progressPct,
        currentStep: `Parsing [${i + 1}/${totalFiles}]: ${file.path.split("/").pop()}`,
      });

      allFilePaths.push(file.path);

      try {
        const content = await getRawFileContent(owner, repo, branch, file.path);

        // Skip very large files (> 500KB)
        if (content.length > 500_000) {
          fetchErrors.push({ filePath: file.path, error: "File too large (>500KB)" });
          continue;
        }

        const parsed = parseFile(file.path, content);
        fileResults.push(parsed);
      } catch (err: any) {
        fetchErrors.push({ filePath: file.path, error: err?.message || "Fetch failed" });
      }
    }

    await updateJob({ progress: 72, currentStep: "Aggregating analysis results..." });

    // ── 4. Aggregate results ─────────────────────────────────
    const successfulResults = fileResults.filter((r) => r.success);
    const failedResults = fileResults.filter((r) => !r.success);
    const allErrors = [
      ...failedResults.map((r) => ({ filePath: r.filePath, error: r.error || "Parse failed" })),
      ...fetchErrors,
    ];

    const allInteractions = successfulResults.flatMap((r) => r.interactions);
    const allComponents = successfulResults.flatMap((r) => r.components);
    const allRoutes = extractRoutes(allFilePaths);

    // Deduplicate components by name+file
    const uniqueComponents = new Map<string, (typeof allComponents)[0]>();
    for (const c of allComponents) {
      uniqueComponents.set(`${c.filePath}::${c.name}`, c);
    }
    const componentsList = Array.from(uniqueComponents.values());

    // Attach interaction counts to components
    const componentInteractionCount = new Map<string, number>();
    for (const interaction of allInteractions) {
      const key = `${interaction.filePath}::${interaction.componentName}`;
      componentInteractionCount.set(key, (componentInteractionCount.get(key) || 0) + 1);
    }
    for (const comp of componentsList) {
      comp.interactionCount = componentInteractionCount.get(`${comp.filePath}::${comp.name}`) || 0;
    }

    await updateJob({ progress: 80, currentStep: "Saving results to database..." });

    // ── 5. Persist results to MongoDB ────────────────────────

    // Clear old data for this project
    await Promise.all([
      db.collection("components").deleteMany({ projectId }),
      db.collection("detectedInteractions").deleteMany({ projectId }),
      db.collection("repositoryAnalysis").deleteMany({ projectId }),
    ]);

    const analysisDoc = {
      projectId,
      status: allErrors.length > 0 ? "completed_with_warnings" : "completed",
      filesScanned: totalFiles + fetchErrors.length,
      filesParsed: successfulResults.length,
      filesSkipped: allErrors.length,
      parseErrors: allErrors.length,
      componentsDetected: componentsList.length,
      routesDetected: allRoutes.length,
      interactionsDetected: allInteractions.length,
      routes: allRoutes,
      errors: allErrors.slice(0, 20), // cap stored errors at 20
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const analysisResult = await db.collection("repositoryAnalysis").insertOne(analysisDoc);
    const analysisId = analysisResult.insertedId.toString();

    // Store components (richer format)
    if (componentsList.length > 0) {
      await db.collection("components").insertMany(
        componentsList.map((c) => ({
          projectId,
          analysisId,
          name: c.name,
          filePath: c.filePath,
          route: c.route,
          lineNumber: c.lineNumber,
          isDefaultExport: c.isDefaultExport,
          interactionCount: c.interactionCount,
          createdAt: new Date().toISOString(),
        }))
      );
    }

    // Store detected interactions
    if (allInteractions.length > 0) {
      await db.collection("detectedInteractions").insertMany(
        allInteractions.map((interaction) => ({
          projectId,
          analysisId,
          type: interaction.type,
          label: interaction.label,
          eventName: interaction.eventName,
          handler: interaction.handler,
          componentName: interaction.componentName,
          filePath: interaction.filePath,
          route: interaction.route,
          lineNumber: interaction.lineNumber,
          confidence: interaction.confidence,
          detectionMethod: interaction.detectionMethod,
          metadata: interaction.metadata || {},
          createdAt: new Date().toISOString(),
        }))
      );
    }

    await updateJob({ progress: 95, currentStep: "Finalizing..." });

    // ── 6. Complete job ──────────────────────────────────────
    const summaryMsg =
      allErrors.length > 0
        ? `Analysis complete with warnings. ${successfulResults.length} files parsed, ${allErrors.length} skipped. ${allInteractions.length} interactions detected.`
        : `Analysis complete. ${successfulResults.length} files parsed. ${componentsList.length} components, ${allRoutes.length} routes, ${allInteractions.length} interactions detected.`;

    await updateJob({
      status: "completed",
      progress: 100,
      currentStep: summaryMsg,
      completedAt: new Date().toISOString(),
      analysisId,
      filesScanned: totalFiles + fetchErrors.length,
      filesParsed: successfulResults.length,
      interactionsDetected: allInteractions.length,
      componentsDetected: componentsList.length,
      routesDetected: allRoutes.length,
    });

    await db.collection("projects").updateOne(
      { _id: projectObjectId },
      {
        $set: {
          status: "Ready",
          lastAnalyzed: new Date().toISOString(),
          interactionsDetected: allInteractions.length,
          componentsDetected: componentsList.length,
        },
      }
    );

    console.log(`[Analysis] Completed: ${allInteractions.length} interactions, ${componentsList.length} components.`);
  } catch (error: any) {
    console.error("[Analysis] Fatal error:", error);
    try {
      await updateJob({
        status: "failed",
        progress: 100,
        currentStep: `Analysis failed: ${error.message || "Unknown error"}`,
        error: error.message,
        completedAt: new Date().toISOString(),
      });
      await db.collection("projects").updateOne({ _id: projectObjectId }, { $set: { status: "Error" } });
    } catch { /* ignore cleanup errors */ }
  }
}

export async function runFallbackAnalysis(projectId: string, jobId: string, repositoryUrl: string, branch: string) {
  const job = (data: Record<string, unknown>) =>
    fallbackStore.saveAnalysisJob({ ...fallbackStore.getJob(jobId), id: jobId, projectId, ...data });

  try {
    job({ status: "running", progress: 5, currentStep: "Loading repository files..." });
    const { owner, repo } = parseGitHubUrl(repositoryUrl);
    const { getRepoFileTree } = await import("./github");
    const files = await getRepoFileTree(owner, repo, branch);
    const analyzableFiles = files.filter((file) => file.type === "blob" && shouldAnalyzeFile(file.path)).slice(0, 50);
    console.log(`[Fallback Analysis] ${repositoryUrl}: ${analyzableFiles.length} analyzable files found.`);
    const allFilePaths = analyzableFiles.map((file) => file.path);
    const parsedResults: ReturnType<typeof parseFile>[] = [];

    for (let index = 0; index < analyzableFiles.length; index++) {
      const file = analyzableFiles[index];
      job({
        progress: Math.round(15 + (index / Math.max(analyzableFiles.length, 1)) * 65),
        currentStep: `Parsing [${index + 1}/${analyzableFiles.length}]: ${file.path.split("/").pop()}`,
      });
      try {
        const content = await getRawFileContent(owner, repo, branch, file.path);
        if (content.length <= 500_000) parsedResults.push(parseFile(file.path, content));
      } catch {
        // Continue when an individual raw file cannot be fetched.
      }
    }

    const successfulResults = parsedResults.filter((result) => result.success);
    const components = successfulResults.flatMap((result) => result.components);
    const interactions = successfulResults.flatMap((result) => result.interactions);
    const uniqueComponents = Array.from(
      new Map(components.map((component) => [`${component.filePath}::${component.name}`, component])).values()
    );
    const interactionCounts = new Map<string, number>();
    for (const interaction of interactions) {
      const key = `${interaction.filePath}::${interaction.componentName}`;
      interactionCounts.set(key, (interactionCounts.get(key) || 0) + 1);
    }
    const result = {
      projectId,
      status: "completed",
      filesScanned: analyzableFiles.length,
      filesParsed: successfulResults.length,
      components: uniqueComponents.map((component) => ({
        ...component,
        interactionCount: interactionCounts.get(`${component.filePath}::${component.name}`) || 0,
      })),
      interactions,
      routes: extractRoutes(allFilePaths),
      completedAt: new Date().toISOString(),
    };
    fallbackStore.saveAnalysisResult(result);
    fallbackStore.updateProjectStatus(projectId, "Ready");
    job({
      status: "completed",
      progress: 100,
      currentStep: `Analysis complete. ${result.filesParsed} files parsed, ${result.components.length} components, ${result.interactions.length} interactions detected.`,
      completedAt: result.completedAt,
      componentsDetected: result.components.length,
      interactionsDetected: result.interactions.length,
    });
    console.log(`[Fallback Analysis] Completed: ${result.components.length} components, ${result.interactions.length} interactions.`);
  } catch (error: any) {
    console.error("[Fallback Analysis] Failed:", error);
    fallbackStore.updateProjectStatus(projectId, "Error");
    job({ status: "failed", progress: 100, currentStep: `Analysis failed: ${error.message || "Unknown error"}`, error: error.message });
  }
}
