import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDbOrNull } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function POST(
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
      // Fallback: can't analyze without DB
      return NextResponse.json(
        { error: "Database unavailable. Please configure MONGODB_URI." },
        { status: 503 }
      );
    }

    // ── 1. Verify project ownership ──────────────────────────
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

    // ── 2. Check for indexed sourceFiles ─────────────────────
    const fileCount = await db.collection("sourceFiles").countDocuments({ projectId });
    if (fileCount === 0) {
      return NextResponse.json(
        { error: "No source files indexed for this project. Please sync the repository first." },
        { status: 400 }
      );
    }

    // ── 3. Create analysis job ───────────────────────────────
    const jobDoc = {
      projectId,
      status: "queued",
      progress: 0,
      currentStep: "Analysis queued...",
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    const jobResult = await db.collection("analysisJobs").insertOne(jobDoc);
    const jobId = jobResult.insertedId.toString();

    // ── 4. Update project status ─────────────────────────────
    await db.collection("projects").updateOne(
      { _id: project._id },
      { $set: { status: "Analyzing", updatedAt: new Date().toISOString() } }
    );

    // ── 5. Fire background analysis ──────────────────────────
    const resolvedProjectId = project._id.toString();
    Promise.resolve().then(async () => {
      try {
        const { runBackgroundAnalysis } = await import("@/lib/analysis-runner");
        await runBackgroundAnalysis(resolvedProjectId, jobId);
      } catch (err) {
        console.error("[Analyze Route] Background analysis error:", err);
      }
    });

    return NextResponse.json({
      success: true,
      jobId,
      projectId: resolvedProjectId,
      message: "AST analysis started. Check /api/repositories/[id]/analysis for progress.",
    });
  } catch (error: any) {
    console.error("[Analyze Route] Error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
