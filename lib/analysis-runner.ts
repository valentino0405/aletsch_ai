import { getDb } from "./mongodb";
import { parseGitHubUrl, getRawFileContent } from "./github";
import { analyzeSourceContent, ComponentMetadata } from "./analyzer";
import { AIService } from "./ai/client";
import { SYSTEM_INTENT_PROMPT, buildComponentIntentUserPrompt } from "./ai/prompts";
import { ObjectId } from "mongodb";

export async function runBackgroundAnalysis(projectId: string, jobId: string) {
  console.log(`Starting background analysis for project: ${projectId}, Job: ${jobId}`);
  
  const hasMongo = !!process.env.MONGODB_URI;
  if (!hasMongo) return;

  let db;
  try {
    db = await getDb();
  } catch (e) {
    console.error("Could not obtain database connection for analysis runner", e);
    return;
  }

  const jobObjectId = new ObjectId(jobId);
  const projectObjectId = new ObjectId(projectId);

  try {
    // 1. Update job to running
    await db.collection("analysisJobs").updateOne(
      { _id: jobObjectId },
      { $set: { status: "running", progress: 10, currentStep: "Fetching source files list..." } }
    );

    // Fetch project to parse URL
    const project = await db.collection("projects").findOne({ _id: projectObjectId });
    if (!project) {
      throw new Error("Project not found in database.");
    }

    const { owner, repo } = parseGitHubUrl(project.repositoryUrl);
    const branch = project.branch || "main";

    // 2. Fetch list of synced files
    const sourceFiles = await db.collection("sourceFiles").find({ projectId }).toArray();
    if (sourceFiles.length === 0) {
      // Complete early if no source files mapped
      await db.collection("analysisJobs").updateOne(
        { _id: jobObjectId },
        { 
          $set: { 
            status: "completed", 
            progress: 100, 
            currentStep: "Sync finished. No relevant source files detected.",
            completedAt: new Date().toISOString()
          } 
        }
      );
      await db.collection("projects").updateOne({ _id: projectObjectId }, { $set: { status: "Ready" } });
      return;
    }

    // Limit to top 15 key files for performance and API quota safety
    const filesToAnalyze = sourceFiles.slice(0, 15);
    const totalFiles = filesToAnalyze.length;
    const detectedComponents: any[] = [];

    // 3. Loop over files and run AST parsing
    for (let i = 0; i < totalFiles; i++) {
      const file = filesToAnalyze[i];
      const progressPercent = Math.round(10 + (i / totalFiles) * 40); // 10% to 50%
      
      await db.collection("analysisJobs").updateOne(
        { _id: jobObjectId },
        { $set: { progress: progressPercent, currentStep: `Parsing code structure: ${file.path}` } }
      );

      try {
        const content = await getRawFileContent(owner, repo, branch, file.path);
        const components = analyzeSourceContent(file.path, content);
        detectedComponents.push(...components);
      } catch (err) {
        console.error(`Error loading or parsing file content for: ${file.path}`, err);
      }
    }

    // Update progress to 50%
    await db.collection("analysisJobs").updateOne(
      { _id: jobObjectId },
      { $set: { progress: 50, currentStep: `Detected ${detectedComponents.length} component candidates. Commencing semantic intent analysis...` } }
    );

    // Clear old components mapping for this project
    await db.collection("components").deleteMany({ projectId });

    const totalComponents = detectedComponents.length;
    const aiConfigured = AIService.isConfigured();

    // 4. Run semantic intent detection on components
    for (let i = 0; i < totalComponents; i++) {
      const comp = detectedComponents[i];
      const progressPercent = Math.round(50 + (i / totalComponents) * 45); // 50% to 95%
      
      await db.collection("analysisJobs").updateOne(
        { _id: jobObjectId },
        { $set: { progress: progressPercent, currentStep: `Analyzing intent: ${comp.name} (${comp.type})` } }
      );

      let semanticResult: any = null;

      if (aiConfigured) {
        // Fetch semantic intent using OpenRouter AI
        const systemPrompt = SYSTEM_INTENT_PROMPT;
        const userPrompt = buildComponentIntentUserPrompt(comp);

        semanticResult = await AIService.generateStructured(
          systemPrompt,
          userPrompt,
          (parsed) => {
            // Validator function to ensure expected schema is present
            if (!parsed.eventName || !parsed.category) return null;
            return {
              componentName: parsed.componentName || comp.name,
              category: parsed.category,
              intent: parsed.intent || "",
              eventName: parsed.eventName,
              importance: parsed.importance || "medium",
              funnelStage: parsed.funnelStage || "general"
            };
          }
        );
      }

      // Fallback to deterministic defaults if AI is not configured or failed
      if (!semanticResult) {
        let suggestedEvent = comp.name.toLowerCase().replace(/button|link|form/g, "");
        suggestedEvent = suggestedEvent ? `${suggestedEvent}_clicked` : "cta_interacted";
        
        let category: "Pageview" | "Interaction" | "Form" | "System" | "Conversion" = "Interaction";
        if (comp.type === "Form") {
          category = "Form";
          suggestedEvent = "form_submitted";
        } else if (comp.type === "Navigation") {
          category = "Pageview";
          suggestedEvent = "page_viewed";
        }

        semanticResult = {
          componentName: comp.name,
          category,
          intent: `User interacts with ${comp.type} control.`,
          eventName: suggestedEvent,
          importance: comp.type === "Form" ? "high" : "medium",
          funnelStage: "general"
        };
      }

      // Save component record to MongoDB
      await db.collection("components").insertOne({
        projectId,
        name: semanticResult.componentName,
        type: comp.type,
        filePath: comp.filePath,
        route: comp.route,
        elementText: comp.elementText || "",
        codeSnippet: comp.codeSnippet,
        handlers: comp.handlers,
        semanticIntent: semanticResult.intent,
        recommendedEvent: semanticResult.eventName,
        importance: semanticResult.importance,
        funnelStage: semanticResult.funnelStage,
        createdAt: new Date().toISOString()
      });
    }

    // 5. Set job to completed successfully
    await db.collection("analysisJobs").updateOne(
      { _id: jobObjectId },
      { 
        $set: { 
          status: "completed", 
          progress: 100, 
          currentStep: `AST analysis & event mappings successfully completed. Mapped ${totalComponents} components.`,
          completedAt: new Date().toISOString()
        } 
      }
    );

    // Set project status to Ready
    await db.collection("projects").updateOne(
      { _id: projectObjectId },
      { $set: { status: "Ready" } }
    );

  } catch (error: any) {
    console.error("Job Runner Failed:", error);
    await db.collection("analysisJobs").updateOne(
      { _id: jobObjectId },
      { 
        $set: { 
          status: "failed", 
          progress: 100, 
          currentStep: "Analysis halted.",
          error: error.message || "Unknown error",
          completedAt: new Date().toISOString()
        } 
      }
    );

    await db.collection("projects").updateOne(
      { _id: projectObjectId },
      { $set: { status: "Error" } }
    );
  }
}
