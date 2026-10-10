// ============================================================
// Aletsch AI — Demo data API
// ------------------------------------------------------------
// POST   /api/analytics/demo-data   seed one scenario into a project
// GET    /api/analytics/demo-data   list scenarios and what is already seeded
// DELETE /api/analytics/demo-data   remove synthetic events from a project
//
// Owner-only, and scoped to one project the caller owns.
//
// The seeder does not write to the events collection. It posts generated
// payloads to the project's own POST /api/ingest, exactly as a browser
// would, so the data proves the whole pipeline works rather than
// bypassing it. That costs an HTTP round trip per event and is worth it:
// a seeder that wrote straight to Mongo could go on passing while ingest
// validation, enrichment or session stitching was broken.
//
// Everything written is marked `source: "synthetic"`, which is what makes
// DELETE safe — it can only ever remove events it could have created.
// ============================================================

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDbOrNull } from "@/lib/mongodb";
import { findOwnedProject } from "@/lib/analytics/scope";
import { generateProjectWriteKey } from "@/lib/security/token-crypto";
import {
  DEMO_FUNNEL_STEPS,
  MAX_GENERATED_EVENTS,
  SCENARIOS,
  SYNTHETIC_SOURCE,
  findScenario,
  generateScenario,
  requiredConversionWindowMs,
  requiredRangeDays,
  type SyntheticPayload,
} from "@/lib/analytics/synthetic";

/** Concurrent ingest posts. High enough to be quick, low enough to stay polite. */
const CONCURRENCY = 24;

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const projectId = new URL(req.url).searchParams.get("projectId");

    const catalog = SCENARIOS.map((scenario) => ({
      key: scenario.key,
      label: scenario.label,
      description: scenario.description,
      stepCounts: scenario.stepCounts,
      totalUsers: scenario.stepCounts[0] ?? 0,
      estimatedEvents: scenario.stepCounts.reduce((total, count) => total + count, 0),
      suggestedRangeDays: requiredRangeDays(scenario),
      suggestedConversionWindowMs: requiredConversionWindowMs(scenario),
    }));

    const db = await getDbOrNull();
    if (!db || !projectId) {
      return NextResponse.json({ ok: true, scenarios: catalog, steps: DEMO_FUNNEL_STEPS, seeded: null });
    }

    const project = await findOwnedProject(db, userId, projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found or unauthorized." }, { status: 404 });
    }

    const seeded = await db
      .collection("events")
      .countDocuments({ projectId: project._id.toString(), source: SYNTHETIC_SOURCE });

    return NextResponse.json({
      ok: true,
      scenarios: catalog,
      steps: DEMO_FUNNEL_STEPS,
      seeded: { events: seeded },
    });
  } catch (error: any) {
    console.error("[DEMO] catalog failed:", error?.message || error);
    return NextResponse.json({ error: "Could not load demo scenarios." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
    }

    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required." }, { status: 400 });
    }

    const scenario = findScenario(typeof body?.scenario === "string" ? body.scenario : "");
    if (!scenario) {
      return NextResponse.json(
        { error: `Unknown scenario. Available: ${SCENARIOS.map((entry) => entry.key).join(", ")}.` },
        { status: 400 }
      );
    }

    const scale = clampScale(body?.scale);

    const db = await getDbOrNull();
    if (!db) {
      return NextResponse.json(
        { error: "No database is configured, so there is nowhere to seed events." },
        { status: 503 }
      );
    }

    const project = await findOwnedProject(db, userId, projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found or unauthorized." }, { status: 404 });
    }

    const resolvedProjectId = project._id.toString();

    // Ingest authorises by write key. A project that has never generated
    // one cannot receive events at all, so mint one now rather than
    // failing with an error the developer cannot act on from here.
    const writeKey = await ensureWriteKey(db, project);

    const { payloads, expected } = generateScenario({
      projectId: resolvedProjectId,
      scenario,
      scale,
      seed: `${scenario.key}:${resolvedProjectId}`,
    });

    if (payloads.length > MAX_GENERATED_EVENTS) {
      return NextResponse.json(
        {
          error: `That scale would generate ${payloads.length.toLocaleString()} events, above the ${MAX_GENERATED_EVENTS.toLocaleString()} limit. Lower the scale.`,
        },
        { status: 400 }
      );
    }

    const ingestUrl = new URL("/api/ingest", req.url).toString();
    const startedAt = Date.now();
    const outcome = await postAll(ingestUrl, writeKey, payloads);
    const elapsedMs = Date.now() - startedAt;

    console.log(
      `[DEMO] project=${resolvedProjectId} scenario=${scenario.key} scale=${scale} ` +
        `generated=${payloads.length} accepted=${outcome.accepted} rejected=${outcome.rejected} ` +
        `executionTime=${elapsedMs}ms`
    );

    return NextResponse.json({
      ok: outcome.rejected === 0,
      scenario: scenario.key,
      generated: payloads.length,
      accepted: outcome.accepted,
      rejected: outcome.rejected,
      // One example, so a partial failure is diagnosable without logs.
      firstError: outcome.firstError,
      elapsedMs,
      expected,
      suggestedQuery: {
        projectId: resolvedProjectId,
        steps: DEMO_FUNNEL_STEPS.map((step) => ({ eventName: step.eventName, name: step.name })),
        dateRange: "30d",
        conversionWindowMs: requiredConversionWindowMs(scenario),
        funnelType: "closed",
        stepOrder: "sequential",
      },
    });
  } catch (error: any) {
    console.error("[DEMO] seeding failed:", error?.message || error);
    return NextResponse.json({ error: "Demo data could not be seeded. The error has been logged." }, { status: 500 });
  }
}

/**
 * Remove generated events from a project.
 *
 * The filter is pinned to `source: "synthetic"`, so this can only delete
 * what the seeder wrote. Real traffic has `source: "web"` and is not
 * reachable from here under any input.
 */
export async function DELETE(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const projectId = new URL(req.url).searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required." }, { status: 400 });
    }

    const db = await getDbOrNull();
    if (!db) {
      return NextResponse.json({ error: "No database is configured." }, { status: 503 });
    }

    const project = await findOwnedProject(db, userId, projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found or unauthorized." }, { status: 404 });
    }

    const scopedToSynthetic = { projectId: project._id.toString(), source: SYNTHETIC_SOURCE };
    const events = await db.collection("events").deleteMany(scopedToSynthetic);
    const sessions = await db.collection("sessions").deleteMany(scopedToSynthetic);

    console.log(
      `[DEMO] project=${project._id.toString()} removed events=${events.deletedCount} sessions=${sessions.deletedCount}`
    );

    return NextResponse.json({
      ok: true,
      removedEvents: events.deletedCount ?? 0,
      removedSessions: sessions.deletedCount ?? 0,
    });
  } catch (error: any) {
    console.error("[DEMO] cleanup failed:", error?.message || error);
    return NextResponse.json({ error: "Demo data could not be removed." }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────

function clampScale(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(5, Math.max(0.01, value));
}

/** Read the project's write key, generating one if it has none. */
async function ensureWriteKey(db: any, project: Record<string, any>): Promise<string> {
  if (typeof project.writeKey === "string" && project.writeKey) return project.writeKey;

  const writeKey = generateProjectWriteKey();
  await db
    .collection("projects")
    .updateOne(
      { _id: project._id },
      { $set: { writeKey, writeKeyCreatedAt: new Date().toISOString() } }
    );
  return writeKey;
}

interface PostOutcome {
  accepted: number;
  rejected: number;
  firstError: string | null;
}

/** Post every payload through the real ingest endpoint, a poolful at a time. */
async function postAll(
  url: string,
  writeKey: string,
  payloads: SyntheticPayload[]
): Promise<PostOutcome> {
  const outcome: PostOutcome = { accepted: 0, rejected: 0, firstError: null };
  let cursor = 0;

  async function worker() {
    while (cursor < payloads.length) {
      const index = cursor;
      cursor += 1;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Aletsch-Write-Key": writeKey },
          body: JSON.stringify(payloads[index]),
        });
        if (response.ok) {
          outcome.accepted += 1;
        } else {
          outcome.rejected += 1;
          if (!outcome.firstError) {
            const detail = await response.json().catch(() => ({}));
            outcome.firstError = `${response.status}: ${detail?.error ?? "ingest rejected the event"}`;
          }
        }
      } catch (error: any) {
        outcome.rejected += 1;
        if (!outcome.firstError) outcome.firstError = error?.message ?? "request failed";
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, payloads.length) }, worker));
  return outcome;
}
