import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDbOrNull } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { fallbackStore } from "@/lib/fallback-store";

export async function GET(
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
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    const db = await getDbOrNull();
    if (!db) {
      const job = fallbackStore.getLatestJob(projectId);
      if (job) return NextResponse.json(job);
      // No job means no analysis ran. Reporting "completed" here would be
      // a fabricated success — the caller would show a green checkmark
      // over work that never happened.
      return NextResponse.json({
        projectId,
        status: "idle",
        progress: 0,
        currentStep: "No analysis has been run yet.",
      });
    }

    // Scope to the caller's own project: a job id alone must not expose
    // another user's analysis progress.
    let project: any = null;
    try {
      project = await db
        .collection("projects")
        .findOne({ _id: new ObjectId(projectId), ownerId: userId });
    } catch {
      // Not a valid ObjectId — fall through to the string form.
    }
    if (!project) {
      project = await db.collection("projects").findOne({ _id: projectId as any, ownerId: userId });
    }
    if (!project) {
      return NextResponse.json({ error: "Project not found or unauthorized." }, { status: 404 });
    }

    // Fetch latest job for this project
    const job = await db.collection("analysisJobs").findOne(
      { projectId },
      { sort: { createdAt: -1 } }
    );

    if (!job) {
      return NextResponse.json({ status: "idle", progress: 0, currentStep: "No analysis has been run yet." });
    }

    return NextResponse.json({
      projectId: job.projectId,
      status: job.status,
      progress: job.progress,
      currentStep: job.currentStep,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error
    });
  } catch (error: any) {
    console.error("Fetch analysis status error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
