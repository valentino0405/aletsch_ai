// ============================================================
// Aletsch AI — Event catalog API
// ------------------------------------------------------------
// GET /api/analytics/events
//
// What the funnel builder's step picker is populated from: the events this
// project has *actually* emitted in the window, with how many users and
// occurrences each has.
//
// This endpoint exists so the builder never offers an invented event
// name. A step pointing at an event nobody emits matches nothing, and its
// 0% reads exactly like a real drop-off — the most misleading number the
// product could show.
//
// It also reports which breakdown dimensions the stored events carry, so
// the UI can say "No country data available" instead of rendering an
// empty chart that looks like a measurement.
// ============================================================

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { Db } from "mongodb";
import { getDbOrNull } from "@/lib/mongodb";
import { resolveProjectScope, projectMatch } from "@/lib/analytics/scope";
import {
  countAllEvents,
  detectAvailableDimensions,
  loadEventCatalog,
} from "@/lib/analytics/event-stream";
import { BREAKDOWN_FIELDS } from "@/lib/analytics/filters";
import {
  AnalyticsRangeError,
  CONVERSION_WINDOW_PRESETS,
  DATE_RANGE_PRESETS,
  resolveDateRange,
} from "@/lib/analytics/time";
import { humanizeEventName } from "@/lib/analytics/funnel";

/** Step pickers do not need a thousand entries; the long tail is noise. */
const CATALOG_LIMIT = 150;

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    let range;
    try {
      range = resolveDateRange(searchParams.get("dateRange"), {
        startDate: searchParams.get("startDate") ?? undefined,
        endDate: searchParams.get("endDate") ?? undefined,
      });
    } catch (error) {
      if (error instanceof AnalyticsRangeError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    const db = await getDbOrNull();
    if (!db) {
      return NextResponse.json({
        ok: true,
        project: null,
        range: describeRange(range),
        events: [],
        breakdownFields: BREAKDOWN_FIELDS.map((field) => ({ ...field, available: false })),
        savedFunnels: [],
        totalEventsAllTime: 0,
        options: OPTIONS_PAYLOAD,
        unavailable: {
          state: "no_database" as const,
          reason: "No database is configured, so no events have been collected.",
        },
      });
    }

    const scope = await resolveProjectScope(db, userId, searchParams.get("projectId"));
    if (!scope.ok) {
      return NextResponse.json({ error: scope.error }, { status: scope.status });
    }
    if (!scope.scope) {
      return NextResponse.json({
        ok: true,
        project: null,
        range: describeRange(range),
        events: [],
        breakdownFields: BREAKDOWN_FIELDS.map((field) => ({ ...field, available: false })),
        savedFunnels: [],
        totalEventsAllTime: 0,
        options: OPTIONS_PAYLOAD,
        unavailable: { state: "no_projects" as const, reason: scope.reason },
      });
    }

    const { projectIds } = scope.scope;

    const [catalog, availability, savedFunnels, totalEventsAllTime] = await Promise.all([
      loadEventCatalog(db, projectIds, range, CATALOG_LIMIT),
      detectAvailableDimensions(
        db,
        projectIds,
        range,
        BREAKDOWN_FIELDS.map((field) => field.field)
      ),
      loadSavedFunnels(db, projectIds),
      countAllEvents(db, projectIds),
    ]);

    return NextResponse.json({
      ok: true,
      project: scope.scope.project,
      range: describeRange(range),
      // `label` is the humanised form the rest of the product already
      // uses, so the same event reads identically everywhere.
      events: catalog.map((entry) => ({ ...entry, label: humanizeEventName(entry.eventName) })),
      breakdownFields: BREAKDOWN_FIELDS.map((field) => ({
        ...field,
        available: Boolean(availability[field.field]),
      })),
      savedFunnels,
      totalEventsAllTime,
      options: OPTIONS_PAYLOAD,
    });
  } catch (error: any) {
    console.error("[ANALYTICS] event catalog failed:", error?.message || error);
    return NextResponse.json(
      { error: "The event catalog could not be loaded. The error has been logged." },
      { status: 500 }
    );
  }
}

/**
 * The builder's controls, served from the same constants the engine
 * validates against — so the UI cannot offer a conversion window the API
 * will reject.
 */
const OPTIONS_PAYLOAD = {
  dateRanges: Object.entries(DATE_RANGE_PRESETS).map(([key, preset]) => ({
    key,
    label: preset.label,
  })),
  conversionWindows: CONVERSION_WINDOW_PRESETS,
};

function describeRange(range: ReturnType<typeof resolveDateRange>) {
  return {
    key: range.key,
    label: range.label,
    startIso: range.startIso,
    endIso: range.endIso,
    days: range.days,
  };
}

/** Funnels the developer saved, so the UI offers real choices. */
async function loadSavedFunnels(db: Db, projectIds: string[]) {
  const rows = await db
    .collection("funnels")
    .find(projectMatch(projectIds), { projection: { name: 1, steps: 1, projectId: 1 } })
    .limit(100)
    .toArray();

  return rows
    .filter((row) => typeof row.name === "string" && Array.isArray(row.steps))
    .map((row) => ({
      name: String(row.name),
      projectId: String(row.projectId ?? ""),
      steps: (row.steps as any[])
        .filter((step) => typeof step?.event === "string" && step.event.trim())
        .map((step) => ({
          eventName: String(step.event).trim(),
          name: typeof step.name === "string" && step.name.trim() ? step.name.trim() : undefined,
        })),
    }))
    .filter((funnel) => funnel.steps.length >= 2);
}
