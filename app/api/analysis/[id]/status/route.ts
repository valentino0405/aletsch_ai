import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

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

    const hasMongo = !!process.env.MONGODB_URI;
    if (!hasMongo) {
      // Mock status return
      return NextResponse.json({
        projectId,
        status: "completed",
        progress: 100,
        currentStep: "Analysis completed successfully (Mock Mode).",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      });
    }

    const db = await getDb();

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
