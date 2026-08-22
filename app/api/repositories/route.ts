import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDbOrNull } from "@/lib/mongodb";
import { parseGitHubUrl, getRepoMetadata, getRepoBranches } from "@/lib/github";
import { fallbackStore } from "@/lib/fallback-store";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getDbOrNull();
    if (db) {
      const repos = await db
        .collection("repositories")
        .find({ ownerId: userId })
        .sort({ lastSyncedAt: -1 })
        .toArray();

      return NextResponse.json(
        repos.map((r) => ({
          id: r._id.toString(),
          name: r.name,
          url: r.url,
          branch: r.defaultBranch || "main",
          language: r.language || "TypeScript",
          status: r.status || "Synced",
        }))
      );
    }

    // Fallback store
    const fbRepos = fallbackStore.getRepositories(userId);
    return NextResponse.json(
      fbRepos.map((r) => ({
        id: r.id,
        name: r.name,
        url: r.url,
        branch: r.defaultBranch || "main",
        language: r.language || "TypeScript",
        status: r.status || "Synced",
      }))
    );
  } catch (error: any) {
    console.error("Repositories GET error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { repositoryUrl } = await req.json();
    if (!repositoryUrl) {
      return NextResponse.json({ error: "Missing repositoryUrl parameter." }, { status: 400 });
    }

    // 1. Validate & Parse URL
    let parsed;
    try {
      parsed = parseGitHubUrl(repositoryUrl);
    } catch (e: any) {
      return NextResponse.json({ error: e.message || "Invalid repository URL format" }, { status: 400 });
    }

    // 2. Fetch metadata from GitHub API
    let meta;
    try {
      meta = await getRepoMetadata(parsed.owner, parsed.repo);
    } catch (e: any) {
      return NextResponse.json({ error: `GitHub communication failed: ${e.message}` }, { status: 400 });
    }

    // 3. Fetch list of branches
    let branches: string[] = ["main"];
    try {
      branches = await getRepoBranches(parsed.owner, parsed.repo);
    } catch (e) {
      console.warn("Could not load branches, default to main", e);
    }

    // 4. Save repository + project to MongoDB or Fallback Store
    const db = await getDbOrNull();
    if (db) {
      const existingProject = await db.collection("projects").findOne({ repositoryUrl, ownerId: userId });
      let projectId = existingProject?._id?.toString();

      // Save to repositories collection
      const repoDoc = {
        ownerId: userId,
        url: repositoryUrl,
        owner: meta.owner,
        name: meta.name,
        defaultBranch: meta.defaultBranch,
        stars: meta.stars,
        forks: meta.forks,
        language: meta.language,
        branches,
        lastSyncedAt: new Date().toISOString(),
        status: "Analyzing",
      };
      await db.collection("repositories").replaceOne(
        { url: repositoryUrl, ownerId: userId },
        repoDoc,
        { upsert: true }
      );

      // Upsert into projects collection
      const projectDoc = {
        ownerId: userId,
        name: meta.name,
        repositoryUrl,
        branch: meta.defaultBranch || "main",
        language: meta.language,
        status: "Analyzing",
        events: 0,
        lastAnalyzed: "Just connected",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const projectResult = await db.collection("projects").replaceOne(
        { repositoryUrl, ownerId: userId },
        projectDoc,
        { upsert: true }
      );

      if (!projectId && projectResult.upsertedId) {
        projectId = projectResult.upsertedId.toString();
      }
      if (!projectId) {
        const updated = await db.collection("projects").findOne({ repositoryUrl, ownerId: userId });
        projectId = updated?._id?.toString();
      }

      // Fire background analysis immediately if projectId is resolved
      if (projectId) {
        const { runBackgroundAnalysis } = await import("@/lib/analysis-runner");
        const { getRepoFileTree } = await import("@/lib/github");

        Promise.resolve().then(async () => {
          try {
            const files = await getRepoFileTree(meta.owner, meta.name, meta.defaultBranch || "main");
            const relevantFiles = files.filter((f: any) => {
              const p = f.path;
              const isCode = p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".js") || p.endsWith(".jsx");
              const isIgnored = p.includes("node_modules/") || p.includes(".next/") || p.includes("dist/");
              return isCode && !isIgnored && f.type === "blob";
            });

            await db.collection("sourceFiles").deleteMany({ projectId });
            if (relevantFiles.length > 0) {
              await db.collection("sourceFiles").insertMany(
                relevantFiles.map((f: any) => ({
                  projectId,
                  path: f.path,
                  githubUrl: f.url,
                  syncedAt: new Date().toISOString(),
                }))
              );
            }

            const jobResult = await db.collection("analysisJobs").insertOne({
              projectId,
              status: "queued",
              progress: 0,
              currentStep: `Indexed ${relevantFiles.length} source files. Starting AST scan...`,
              startedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            });

            await runBackgroundAnalysis(projectId, jobResult.insertedId.toString());
          } catch (err) {
            console.error("Background analysis failed after repo connect:", err);
          }
        });
      }

      return NextResponse.json({
        success: true,
        id: projectId,
        meta,
        branches,
        language: meta.language,
        message: "Repository connected. Background code analysis has started.",
      });
    }

    // In-memory Fallback Store
    const fallbackId = "fb_" + Math.random().toString(36).substr(2, 9);
    fallbackStore.saveRepository({
      id: fallbackId,
      ownerId: userId,
      url: repositoryUrl,
      owner: meta.owner,
      name: meta.name,
      defaultBranch: meta.defaultBranch,
      stars: meta.stars,
      forks: meta.forks,
      language: meta.language,
      branches,
      lastSyncedAt: new Date().toISOString(),
      status: "Synced",
    });

    fallbackStore.saveProject({
      id: fallbackId,
      ownerId: userId,
      name: meta.name,
      repositoryUrl,
      branch: meta.defaultBranch || "main",
      language: meta.language,
      status: "Synced",
      events: 0,
      lastAnalyzed: "Just connected",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      id: fallbackId,
      meta,
      branches,
      language: meta.language,
      message: "Repository connected successfully.",
    });
  } catch (error: any) {
    console.error("Repository API error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}


