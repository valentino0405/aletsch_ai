import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDbOrNull } from "@/lib/mongodb";
import { fallbackStore } from "@/lib/fallback-store";
import { connectRepository, ConnectError } from "@/lib/connect-repository";

/**
 * POST /api/projects
 *
 * Creating a project *is* connecting a repository — this route and
 * POST /api/repositories run the identical pipeline, so a project added
 * here gets the same GitHub metadata and the same background analysis as
 * one added from the Repositories page.
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
    console.error("Projects POST error:", error);
    return NextResponse.json({ error: error?.message || "Server Error" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getDbOrNull();
    if (db) {
      const projects = await db
        .collection("projects")
        .find({ ownerId: userId })
        .sort({ updatedAt: -1 })
        .toArray();

      // Event and session counts are read from what was actually
      // ingested. A project with no traffic reports zero rather than
      // inheriting a number from somewhere else.
      const projectIds = projects.map((project) => project._id.toString());
      const [eventCounts, userCounts] = await Promise.all([
        db
          .collection("events")
          .aggregate([
            { $match: { projectId: { $in: projectIds } } },
            { $group: { _id: "$projectId", count: { $sum: 1 } } },
          ])
          .toArray(),
        db
          .collection("events")
          .aggregate([
            { $match: { projectId: { $in: projectIds } } },
            // `userId` on an event document is the tracked end user of
            // the developer's app, not an Aletsch account.
            { $group: { _id: { projectId: "$projectId", user: "$userId" } } },
            { $group: { _id: "$_id.projectId", count: { $sum: 1 } } },
          ])
          .toArray(),
      ]);

      const eventsByProject = new Map(eventCounts.map((row: any) => [row._id, row.count]));
      const usersByProject = new Map(userCounts.map((row: any) => [row._id, row.count]));

      return NextResponse.json(
        projects.map((project) => {
          const id = project._id.toString();
          return {
            ...project,
            _id: id,
            eventCount: eventsByProject.get(id) ?? 0,
            userCount: usersByProject.get(id) ?? 0,
          };
        })
      );
    }

    const fallbackProjects = fallbackStore.getProjects(userId);
    return NextResponse.json(
      fallbackProjects.map((project) => ({
        _id: project.id,
        name: project.name,
        repositoryUrl: project.repositoryUrl,
        branch: project.branch,
        language: project.language,
        ownerId: project.ownerId,
        status: project.status,
        eventCount: 0,
        userCount: 0,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      }))
    );
  } catch (error: any) {
    console.error("Projects GET error:", error);
    return NextResponse.json({ error: error?.message || "Server Error" }, { status: 500 });
  }
}
