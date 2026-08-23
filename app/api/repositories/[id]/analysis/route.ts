import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDbOrNull } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: projectId } = await params;
    if (!projectId) {
      return NextResponse.json({ error: "Missing project ID." }, { status: 400 });
    }

    const db = await getDbOrNull();
    if (!db) {
      return NextResponse.json({ status: "idle", message: "Database unavailable." });
    }

    // Verify ownership
    let project: any = null;
    try {
      project = await db.collection("projects").findOne({
        _id: new ObjectId(projectId),
        ownerId: userId,
      });
    } catch {
      project = await db.collection("projects").findOne({
        _id: projectId as any,
        ownerId: userId,
      });
    }

    if (!project) {
      return NextResponse.json({ error: "Project not found or unauthorized." }, { status: 404 });
    }

    const resolvedId = project._id.toString();

    // Get latest job for this project
    const latestJob = await db
      .collection("analysisJobs")
      .find({ projectId: resolvedId })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    // Get latest repositoryAnalysis doc
    const latestAnalysis = await db
      .collection("repositoryAnalysis")
      .find({ projectId: resolvedId })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    const job = latestJob[0] || null;
    const analysis = latestAnalysis[0] || null;

    return NextResponse.json({
      projectId: resolvedId,
      projectStatus: project.status,
      job: job
        ? {
            id: job._id.toString(),
            status: job.status,
            progress: job.progress || 0,
            currentStep: job.currentStep || "",
            startedAt: job.startedAt,
            completedAt: job.completedAt,
            filesScanned: job.filesScanned,
            filesParsed: job.filesParsed,
            interactionsDetected: job.interactionsDetected,
            componentsDetected: job.componentsDetected,
            routesDetected: job.routesDetected,
          }
        : null,
      analysis: analysis
        ? {
            id: analysis._id.toString(),
            status: analysis.status,
            filesScanned: analysis.filesScanned,
            filesParsed: analysis.filesParsed,
            filesSkipped: analysis.filesSkipped,
            parseErrors: analysis.parseErrors,
            componentsDetected: analysis.componentsDetected,
            routesDetected: analysis.routesDetected,
            interactionsDetected: analysis.interactionsDetected,
            routes: analysis.routes || [],
            errors: analysis.errors || [],
            startedAt: analysis.startedAt,
            completedAt: analysis.completedAt,
          }
        : null,
    });
  } catch (error: any) {
    console.error("[Analysis Status Route] Error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
