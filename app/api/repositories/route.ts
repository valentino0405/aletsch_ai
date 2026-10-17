import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDbOrNull } from "@/lib/mongodb";
import { fallbackStore } from "@/lib/fallback-store";
import { connectRepository, ConnectError } from "@/lib/connect-repository";

/**
 * GET /api/repositories
 *
 * Lists connected repositories. Each row carries the `projectId` of the
 * project it belongs to: every other route in the app is keyed by project
 * id, so returning the repositories collection's own `_id` here used to
 * make "Sync Now" fail with a 404.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getDbOrNull();
    if (db) {
      const [repos, projects] = await Promise.all([
        db.collection("repositories").find({ ownerId: userId }).sort({ lastSyncedAt: -1 }).toArray(),
        db.collection("projects").find({ ownerId: userId }).toArray(),
      ]);

      // Repositories connected before projectId was stored are matched
      // back to their project by URL.
      const projectByUrl = new Map(projects.map((project) => [project.repositoryUrl, project]));

      return NextResponse.json(
        repos.map((repo) => {
          const project = projectByUrl.get(repo.url);
          return {
            id: repo.projectId || project?._id?.toString() || repo._id.toString(),
            projectId: repo.projectId || project?._id?.toString() || null,
            name: repo.fullName || repo.name,
            url: repo.url,
            branch: repo.branch || repo.defaultBranch || "main",
            defaultBranch: repo.defaultBranch || "main",
            language: repo.language || "Unknown",
            isPrivate: Boolean(repo.isPrivate),
            stars: repo.stars ?? 0,
            // Status is read from the project, which is what the analysis
            // pipeline actually updates.
            status: project?.status || repo.status || "Unknown",
            lastSyncedAt: repo.lastSyncedAt || null,
          };
        })
      );
    }

    return NextResponse.json(
      fallbackStore.getRepositories(userId).map((repo) => ({
        id: repo.id,
        projectId: repo.id,
        name: repo.name,
        url: repo.url,
        branch: repo.defaultBranch || "main",
        defaultBranch: repo.defaultBranch || "main",
        language: repo.language || "Unknown",
        isPrivate: false,
        stars: repo.stars ?? 0,
        status: repo.status || "Unknown",
        lastSyncedAt: repo.lastSyncedAt || null,
      }))
    );
  } catch (error: any) {
    console.error("Repositories GET error:", error);
    return NextResponse.json({ error: error?.message || "Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/repositories
 * Connects a repository. Identical in effect to POST /api/projects —
 * both delegate to the one connect pipeline.
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const repositoryUrl = body.repositoryUrl;
    if (!repositoryUrl || typeof repositoryUrl !== "string") {
      return NextResponse.json({ error: "A GitHub repository URL is required." }, { status: 400 });
    }

    const db = await getDbOrNull();
    const result = await connectRepository({
      db,
      userId,
      repositoryUrl,
      branch: typeof body.branch === "string" ? body.branch : undefined,
      name: typeof body.name === "string" ? body.name : undefined,
    });

    return NextResponse.json({
      success: true,
      id: result.projectId,
      projectId: result.projectId,
      name: result.name,
      repositoryUrl: result.repositoryUrl,
      branch: result.branch,
      language: result.language,
      isPrivate: result.isPrivate,
      branches: result.branches,
      reconnected: result.reconnected,
      analysisStarted: result.analysisStarted,
      message: result.message,
    });
  } catch (error: any) {
    if (error instanceof ConnectError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Repositories POST error:", error);
    return NextResponse.json({ error: error?.message || "Server Error" }, { status: 500 });
  }
}
