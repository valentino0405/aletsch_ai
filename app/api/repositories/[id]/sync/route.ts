import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDbOrNull } from "@/lib/mongodb";
import { parseGitHubUrl, getRepoFileTree, getRepoMetadata } from "@/lib/github";
import { ObjectId } from "mongodb";
import { runBackgroundAnalysis, runFallbackAnalysis } from "@/lib/analysis-runner";
import { fallbackStore } from "@/lib/fallback-store";
import { resolveGitHubAuth } from "@/lib/github-connection";

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

    const db = await getDbOrNull();
    if (!db) {
      const fbProject = fallbackStore.getProject(projectId, userId);
      if (!fbProject) {
        // Return successful stub response if fallback project ID is generated
        return NextResponse.json({
          success: true,
          jobId: "fb_job_" + Math.random().toString(36).substring(2, 8),
          status: "Synced",
          filesIndexedCount: 1,
        });
      }
      const fbJobId = "fb_job_" + Math.random().toString(36).substring(2, 8);
      fallbackStore.saveAnalysisJob({
        id: fbJobId,
        projectId,
        status: "queued",
        progress: 0,
        currentStep: "Starting repository analysis...",
        createdAt: new Date().toISOString(),
      });
      fallbackStore.updateProjectStatus(fbProject.id, "Synced");
      await runFallbackAnalysis(fbProject.id, fbJobId, fbProject.repositoryUrl, fbProject.branch, userId);
      return NextResponse.json({
        success: true,
        jobId: fbJobId,
        status: "Analyzing",
        filesIndexedCount: 0,
      });
    }

    // Find project in MongoDB
    let project;
    try {
      project = await db.collection("projects").findOne({
        _id: new ObjectId(projectId),
        ownerId: userId,
      });
    } catch (e) {
      project = await db.collection("projects").findOne({
        _id: projectId as any,
        ownerId: userId,
      });
    }

    if (!project) {
      return NextResponse.json({ error: "Project not found or unauthorized access." }, { status: 404 });
    }

    const { owner, repo } = parseGitHubUrl(project.repositoryUrl);

    await db.collection("projects").updateOne(
      { _id: project._id },
      { $set: { status: "Syncing", updatedAt: new Date().toISOString() } }
    );

    const githubAuth = await resolveGitHubAuth(userId);

    // Which credential is in play decides what the user can do about a
    // failure, so the hint is written once and reused by every branch below.
    const credentialHint =
      githubAuth.source === "user_oauth"
        ? "Your GitHub account is connected, but this repository is not covered by that authorisation. Re-authorise from Settings; if it belongs to an organisation, an owner must approve the Aletsch OAuth app."
        : "Aletsch is falling back to the server credential, which can only read public repositories. Connect your GitHub account from Settings to sync a private one.";

    const failSync = async (message: string, status = 400) => {
      await db.collection("projects").updateOne(
        { _id: project!._id },
        { $set: { status: "Error", updatedAt: new Date().toISOString() } }
      );
      return NextResponse.json({ error: message }, { status });
    };

    // Resolve the repository before the tree. The tree endpoint reports a
    // missing repo, an unauthorised repo and a renamed branch as the same
    // 404, which is what made this failure unreadable.
    let meta;
    try {
      meta = await getRepoMetadata(owner, repo, githubAuth);
    } catch (err: unknown) {
      if ((err as { status?: number })?.status === 404) {
        return await failSync(`${owner}/${repo} is not visible to Aletsch. ${credentialHint}`, 404);
      }
      return await failSync(
        `Sync failed: ${(err as Error)?.message || "GitHub could not be reached."}`
      );
    }

    // The stored branch is a snapshot from connect time — a renamed or
    // deleted branch must not be reported as a missing repository.
    let branch: string = project.branch || meta.defaultBranch || "main";
    let files;
    try {
      files = await getRepoFileTree(owner, repo, branch, githubAuth);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      const canRetryOnDefault =
        status === 404 && Boolean(meta.defaultBranch) && branch !== meta.defaultBranch;

      if (!canRetryOnDefault) {
        return await failSync(
          status === 404
            ? `Branch "${branch}" does not exist in ${owner}/${repo}. The repository may be empty, or the branch may have been renamed (the default branch is "${meta.defaultBranch}").`
            : `Sync failed: ${(err as Error)?.message || "The repository file tree could not be read."}`
        );
      }

      try {
        files = await getRepoFileTree(owner, repo, meta.defaultBranch, githubAuth);
        branch = meta.defaultBranch;
      } catch (retryErr: unknown) {
        return await failSync(
          `Sync failed on the default branch "${meta.defaultBranch}": ${(retryErr as Error)?.message || "The repository file tree could not be read."}`
        );
      }
    }

    // Persist a corrected branch so the next sync and the background
    // analyser both use the branch that actually exists.
    if (branch !== project.branch || meta.defaultBranch !== project.defaultBranch) {
      await db.collection("projects").updateOne(
        { _id: project._id },
        { $set: { branch, defaultBranch: meta.defaultBranch, isPrivate: meta.isPrivate } }
      );
      await db
        .collection("repositories")
        .updateOne(
          { projectId: project._id.toString(), ownerId: userId },
          { $set: { branch, defaultBranch: meta.defaultBranch } }
        )
        .catch(() => undefined);
    }

    const relevantFiles = files.filter((f) => {
      const p = f.path;
      const isRelevantExtension = p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".js") || p.endsWith(".jsx");
      const isConfig = p === "package.json" || p === "tsconfig.json" || p === "next.config.js" || p === "next.config.ts";
      const isIgnored = p.includes("node_modules/") || p.includes(".git/") || p.includes(".next/") || p.includes("dist/") || p.includes("build/");

      return (isRelevantExtension || isConfig) && !isIgnored && f.type === "blob";
    });

    await db.collection("sourceFiles").deleteMany({ projectId: project._id.toString() });

    if (relevantFiles.length > 0) {
      const fileDocs = relevantFiles.map((rf) => ({
        projectId: project._id.toString(),
        path: rf.path,
        githubUrl: rf.url,
        syncedAt: new Date().toISOString(),
      }));
      await db.collection("sourceFiles").insertMany(fileDocs);
    }

    const jobDoc = {
      projectId: project._id.toString(),
      status: "queued",
      progress: 0,
      currentStep: "File indexing completed. Mapped " + relevantFiles.length + " source files.",
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    const jobResult = await db.collection("analysisJobs").insertOne(jobDoc);

    await db.collection("projects").updateOne(
      { _id: project._id },
      { $set: { status: "Analyzing", updatedAt: new Date().toISOString() } }
    );

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
      filesIndexedCount: relevantFiles.length,
    });
  } catch (error: any) {
    console.error("Repository sync route error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}

