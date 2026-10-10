// ============================================================
// Aletsch AI — Funnel runner
// ------------------------------------------------------------
// The thin seam between the database and the pure engine: load the
// events, hand them to `funnel-engine`, attach the metadata that lets a
// developer tell a real zero from an empty collection.
//
// No arithmetic happens here. Every number in the response comes out of
// the pure functions in funnel-engine.ts.
// ============================================================

import type { Db } from "mongodb";
import type {
  FunnelQuery,
  FunnelRunResult,
  FunnelStepSpec,
  PropertyFilter,
} from "./types";
import {
  buildJourneys,
  computeFunnelAnalysis,
  computeFunnelBreakdown,
  type AnalysisContext,
} from "./funnel-engine";
import { detectAvailableDimensions, hasAnyEvents, loadUserStreams } from "./event-stream";
import { ensureAnalyticsIndexes } from "./indexes";

export interface RunFunnelOptions {
  name?: string;
  source?: FunnelRunResult["definition"]["source"];
}

/**
 * Execute one funnel query end to end.
 *
 * Only the events named by the funnel's steps are loaded. A five-step
 * funnel over a project with a hundred event types reads a small
 * fraction of the collection, and the per-user ordering the engine needs
 * comes straight off the `project_user_time` index.
 */
export async function runFunnelAnalysis(
  db: Db,
  projectIds: string[],
  query: FunnelQuery,
  options: RunFunnelOptions = {}
): Promise<FunnelRunResult> {
  const startedAt = Date.now();

  // Idempotent and cached per process; a cold first call pays for it once.
  await ensureAnalyticsIndexes(db);

  const steps = query.steps;
  const eventNames = [...new Set(steps.map((step) => step.eventName))];
  const dimensions = query.breakdown ? [query.breakdown] : [];

  const loaded = await loadUserStreams(db, projectIds, query.range, {
    eventNames,
    filters: query.filters,
  });

  const journeys = buildJourneys(loaded.streams, steps, {
    conversionWindowMs: query.conversionWindowMs,
    funnelType: query.funnelType,
    stepOrder: query.stepOrder,
    dimensions,
  });

  // Only ask these questions when the answer will change what the UI
  // says — i.e. when the funnel came back empty.
  const context = await resolveContext(db, projectIds, query, loaded.eventsScanned);

  const analysis = computeFunnelAnalysis(journeys, steps, context);

  let breakdown: FunnelRunResult["breakdown"] = null;
  if (query.breakdown) {
    const availability = await detectAvailableDimensions(db, projectIds, query.range, [query.breakdown]);
    breakdown = computeFunnelBreakdown(journeys, query.breakdown, steps.length, {
      availableInRange: availability[query.breakdown],
    });
  }

  const executionMs = Date.now() - startedAt;

  // Operational detail only: project ids and counts, never event
  // payloads, user identifiers, keys or credentials.
  console.log(
    `[FUNNEL] project=${projectIds.join(",")} steps=${steps.length} type=${query.funnelType} ` +
      `range=${query.range.key} scanned=${loaded.eventsScanned} users=${loaded.usersScanned} ` +
      `entered=${analysis.totalUsers} converted=${analysis.convertedUsers} ` +
      `state=${analysis.dataState} executionTime=${executionMs}ms`
  );

  return {
    ...analysis,
    definition: {
      name: options.name ?? "Custom funnel",
      source: options.source ?? "custom",
      steps: steps.map((step, index) => ({
        order: index + 1,
        name: analysis.steps[index]?.name ?? step.eventName,
        eventName: step.eventName,
        filters: step.filters ?? [],
      })),
    },
    breakdown,
    meta: {
      projectIds,
      range: {
        key: query.range.key,
        label: query.range.label,
        startIso: query.range.startIso,
        endIso: query.range.endIso,
      },
      conversionWindowMs: query.conversionWindowMs,
      funnelType: query.funnelType,
      stepOrder: query.stepOrder,
      countMethod: query.countMethod,
      eventsScanned: loaded.eventsScanned,
      usersScanned: loaded.usersScanned,
      truncated: loaded.truncated,
      malformedEvents: loaded.malformedEvents,
      syntheticEvents: loaded.syntheticEvents,
      executionMs,
    },
  };
}

/**
 * Distinguish "no events at all" from "no events matching these steps"
 * from "events matched but nobody entered".
 *
 * The extra query only runs when the funnel produced nothing, so the
 * common path costs one round trip.
 */
async function resolveContext(
  db: Db,
  projectIds: string[],
  query: FunnelQuery,
  eventsScanned: number
): Promise<AnalysisContext> {
  if (eventsScanned > 0) {
    return { anyEventsInRange: true, anyStepEventsInRange: true };
  }
  const anyEvents = await hasAnyEvents(db, projectIds, query.range);
  return { anyEventsInRange: anyEvents, anyStepEventsInRange: false };
}

/** Normalise loose step input into the engine's shape. */
export function toStepSpecs(
  steps: Array<{ eventName: string; name?: string; filters?: PropertyFilter[] }>
): FunnelStepSpec[] {
  return steps.map((step) => ({
    eventName: step.eventName,
    name: step.name,
    filters: step.filters && step.filters.length > 0 ? step.filters : undefined,
  }));
}
