import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ObjectId } from "mongodb";
import { getDbOrNull } from "@/lib/mongodb";
import { computeFunnel, deriveFunnelDefinition, type FunnelDefinition } from "@/lib/analytics/funnel";

/**
 * Funnels are built from events the project has actually emitted, or
 * from a definition the developer saved. There is no built-in "Onboarding
 * Funnel" of guessed event names: a funnel whose steps nobody can reach
 * is not a measurement, it reports 0% drop-off as if it meant something.
 *
 * When there is nothing to measure the response says so explicitly
 * (`insufficientData: true`, `steps: []`) and the UI renders that state.
 */
export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectIdParam = searchParams.get("projectId");
    const funnelName = searchParams.get("name");

    const db = await getDbOrNull();
    if (!db) {
      return NextResponse.json({
        funnelName: null,
        source: null,
        steps: [],
        conversionRate: null,
        largestDropoff: null,
        atRiskCount: 0,
        totalUsers: 0,
        insufficientData: true,
        reason:
          "No database is configured, so no events have been collected. Set MONGODB_URI and instrument a repository to build a funnel.",
      });
    }

    // Scope strictly to the caller's own projects.
    const ownedProjects = await db.collection("projects").find({ ownerId: userId }).toArray();
    let projectIds = ownedProjects.map((project) => project._id.toString());

    if (projectIdParam) {
      let owned = projectIds.includes(projectIdParam);
      if (!owned) {
        // Tolerate an ObjectId/string mismatch in stored ids.
        try {
          const match = await db
            .collection("projects")
            .findOne({ _id: new ObjectId(projectIdParam), ownerId: userId });
          owned = !!match;
        } catch {
          owned = false;
        }
      }
      if (!owned) {
        return NextResponse.json({ error: "Project not found or unauthorized." }, { status: 404 });
      }
      projectIds = [projectIdParam];
    }

    if (projectIds.length === 0) {
      return NextResponse.json({
        funnelName: null,
        source: null,
        steps: [],
        conversionRate: null,
        largestDropoff: null,
        atRiskCount: 0,
        totalUsers: 0,
        insufficientData: true,
        reason: "No projects connected yet.",
      });
    }

    // A named funnel the developer saved takes precedence over derivation.
    let definition: FunnelDefinition | null = null;
    if (funnelName) {
      const saved = await db
        .collection("funnels")
        .findOne({ projectId: { $in: projectIds }, name: funnelName });
      if (saved && Array.isArray(saved.steps) && saved.steps.length >= 2) {
        definition = {
          name: saved.name,
          steps: saved.steps.filter((step: any) => step?.event),
          source: "saved",
        };
      }
    }

    definition = definition ?? (await deriveFunnelDefinition(db, projectIds));

    if (!definition) {
      return NextResponse.json({
        funnelName: null,
        source: null,
        steps: [],
        conversionRate: null,
        largestDropoff: null,
        atRiskCount: 0,
        totalUsers: 0,
        insufficientData: true,
        reason:
          "This project has emitted fewer than two distinct events, so there is no journey to build a funnel from yet.",
      });
    }

    const result = await computeFunnel(db, projectIds, definition);

    return NextResponse.json({
      ...result,
      // Available saved funnels, so the UI can offer real choices rather
      // than a hardcoded list of funnel names.
      available: await db
        .collection("funnels")
        .find({ projectId: { $in: projectIds } }, { projection: { name: 1 } })
        .toArray()
        .then((rows) => rows.map((row) => row.name).filter(Boolean)),
    });
  } catch (error: any) {
    console.error("Funnels API route error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}

/** Saves a funnel definition so it is used in place of a derived one. */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { projectId, name, steps } = body ?? {};

    if (!projectId || !name || !Array.isArray(steps) || steps.length < 2) {
      return NextResponse.json(
        { error: "projectId, name, and at least two steps are required." },
        { status: 400 }
      );
    }

    const db = await getDbOrNull();
    if (!db) {
      return NextResponse.json(
        { error: "No database configured, so funnels cannot be saved." },
        { status: 503 }
      );
    }

    let project: any = null;
    try {
      project = await db
        .collection("projects")
        .findOne({ _id: new ObjectId(projectId), ownerId: userId });
    } catch {
      project = await db.collection("projects").findOne({ _id: projectId as any, ownerId: userId });
    }
    if (!project) {
      return NextResponse.json({ error: "Project not found or unauthorized." }, { status: 404 });
    }

    const cleanSteps = steps
      .filter((step: any) => typeof step?.event === "string" && step.event.trim())
      .map((step: any) => ({ name: String(step.name || step.event), event: String(step.event).trim() }));

    if (cleanSteps.length < 2) {
      return NextResponse.json({ error: "At least two valid steps are required." }, { status: 400 });
    }

    const now = new Date().toISOString();
    await db.collection("funnels").updateOne(
      { projectId: project._id.toString(), name },
      {
        $set: { steps: cleanSteps, updatedAt: now, ownerId: userId },
        $setOnInsert: { projectId: project._id.toString(), name, createdAt: now },
      },
      { upsert: true }
    );

    const result = await computeFunnel(db, [project._id.toString()], {
      name,
      steps: cleanSteps,
      source: "saved",
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("Funnels API POST error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
