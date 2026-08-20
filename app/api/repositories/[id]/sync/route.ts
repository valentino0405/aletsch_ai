import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/mongodb";
import { parseGitHubUrl, getRepoFileTree } from "@/lib/github";
import { ObjectId } from "mongodb";
import { runBackgroundAnalysis } from "@/lib/analysis-runner";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: projectId } = await params;
    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    const hasMongo = !!process.env.MONGODB_URI;
    if (!hasMongo) {
      // Mock flow success fallback
      return NextResponse.json({
        success: true,
        status: "Syncing",
        message: "Project sync triggered in mock mode."
      });
    }

    const db = await getDb();
    
    // Find project
    let project;
    try {
      project = await db.collection("projects").findOne({
        _id: new ObjectId(projectId),
        ownerId: userId
      });
    } catch (e) {
      // Try to find as string ID
      project = await db.collection("projects").findOne({
        _id: projectId as any,
        ownerId: userId
      });
    }

    if (!project) {
      return NextResponse.json({ error: "Project not found or unauthorized access." }, { status: 404 });
    }

    const { owner, repo } = parseGitHubUrl(project.repositoryUrl);
    const branch = project.branch || "main";

    // Update status to Syncing
    await db.collection("projects").updateOne(
      { _id: project._id },
      { $set: { status: "Syncing", updatedAt: new Date().toISOString() } }
    );

    // 1. Fetch file tree
    let files;
    try {
      files = await getRepoFileTree(owner, repo, branch);
    } catch (err: any) {
      await db.collection("projects").updateOne(
        { _id: project._id },
        { $set: { status: "Error", updatedAt: new Date().toISOString() } }
      );
      return NextResponse.json({ error: `Sync failed: ${err.message}` }, { status: 400 });
    }

    // Filter relevant files: code files, config, package files
    const relevantFiles = files.filter(f => {
      const p = f.path;
      const isRelevantExtension = p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".js") || p.endsWith(".jsx");
      const isConfig = p === "package.json" || p === "tsconfig.json" || p === "next.config.js" || p === "next.config.ts";
      
      const isIgnored = p.includes("node_modules/") || p.includes(".git/") || p.includes(".next/") || p.includes("dist/") || p.includes("build/");
      
      return (isRelevantExtension || isConfig) && !isIgnored && f.type === "blob";
    });

    // 2. Save sourceFiles structure in MongoDB
    // Delete old files mapped to this project
    await db.collection("sourceFiles").deleteMany({ projectId: project._id.toString() });

    if (relevantFiles.length > 0) {
      const fileDocs = relevantFiles.map(rf => ({
        projectId: project._id.toString(),
        path: rf.path,
        githubUrl: rf.url,
        syncedAt: new Date().toISOString()
      }));
      await db.collection("sourceFiles").insertMany(fileDocs);
    }

    // 3. Create AnalysisJob tracking
    const jobDoc = {
      projectId: project._id.toString(),
      status: "queued",
      progress: 0,
      currentStep: "File indexing completed. Mapped " + relevantFiles.length + " source files.",
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    const jobResult = await db.collection("analysisJobs").insertOne(jobDoc);

    // Update status to Syncing
    await db.collection("projects").updateOne(
      { _id: project._id },
      { $set: { status: "Analyzing", updatedAt: new Date().toISOString() } }
    );

    // Fire off AST Analysis asynchronously in the background
    const pId = project._id.toString();
    const jId = jobResult.insertedId.toString();
    Promise.resolve().then(async () => {
      try {
        await runBackgroundAnalysis(pId, jId);
      } catch (err) {
        console.error("Failed to run background analysis process:", err);
      }
    });

    return NextResponse.json({
      success: true,
      jobId: jId,
      status: "Analyzing",
      filesIndexedCount: relevantFiles.length
    });
  } catch (error: any) {
    console.error("Repository sync route error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
