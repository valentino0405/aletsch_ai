// ============================================================
// Aletsch AI — Funnel engine
// ------------------------------------------------------------
// One place where funnels are defined and counted, so every surface
// (dashboard, funnels page, AI insights) reports the same numbers.
//
// Two rules govern this module:
//
//   1. Steps are never invented. A funnel is either one the developer
//      saved, or one derived from events this project has actually
//      emitted. If the project has no events, there is no funnel — the
//      caller gets `null` and must say so rather than showing zeros
//      dressed up as a measurement.
//
//   2. Every number returned is counted from the `events` collection.
//      No constants, no placeholders, no "typical" rates.
// ============================================================

import type { Db } from "mongodb";

export interface FunnelStepDefinition {
  name: string;
  event: string;
}

export interface FunnelDefinition {
  name: string;
  steps: FunnelStepDefinition[];
  /**
   * Where the steps came from. Surfaced in the UI so a developer can
   * tell a saved funnel from one Aletsch guessed at from event names.
   */
  source: "saved" | "derived-from-catalog" | "derived-from-events";
}

export interface FunnelStepResult {
  name: string;
  event: string;
  users: number;
  /** Share of the first step's users who reached this step. */
  percent: number;
  /** Share of the first step's users lost between the previous step and this one. */
  drop: number;
  /** Share of the *previous* step's users lost here — the honest local rate. */
  dropFromPrevious: number;
}

export interface FunnelResult {
  funnelName: string;
  source: FunnelDefinition["source"];
  steps: FunnelStepResult[];
  /** Users who reached the final step, as a share of the first step. */
  conversionRate: number | null;
  largestDropoff: { from: string; to: string; rate: number } | null;
  /** Steps losing at least `AT_RISK_THRESHOLD` of the previous step. */
  atRiskCount: number;
  totalUsers: number;
  /** True when no user reached step one, so every rate is meaningless. */
  insufficientData: boolean;
}

/** A step losing this share of the previous step is flagged as at risk. */
export const AT_RISK_THRESHOLD = 25;

/**
 * Canonical ordering for funnel stages.
 *
 * The intent classifier tags every event with a `funnelStage`; this list
 * puts those stages into the order a user would move through them, so a
 * derived funnel reads as a journey instead of an arbitrary list.
 */
const STAGE_ORDER = [
  "discovery",
  "landing",
  "acquisition",
  "signup",
  "authentication",
  "onboarding",
  "activation",
  "configuration",
  "project_creation",
  "core_usage",
  "engagement",
  "collaboration",
  "payment",
  "checkout",
  "conversion",
  "retention",
];

function stageRank(stage: string | undefined | null): number {
  if (!stage) return STAGE_ORDER.length;
  const normalized = stage.toLowerCase().replace(/[\s-]+/g, "_");
  const index = STAGE_ORDER.indexOf(normalized);
  return index === -1 ? STAGE_ORDER.length : index;
}

/** "project_created" -> "Project Created" */
export function humanizeEventName(eventName: string): string {
  return eventName
    .split(/[_\-.]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Works out which steps this project's funnel should have.
 *
 * Returns null when the project has emitted nothing — there is no
 * honest funnel to show for a project with no data.
 */
export async function deriveFunnelDefinition(
  db: Db,
  projectIds: string[],
  options: { maxSteps?: number; funnelName?: string } = {}
): Promise<FunnelDefinition | null> {
  const maxSteps = options.maxSteps ?? 6;

  // ── 1. A funnel the developer saved wins outright ─────────
  const saved = await db
    .collection("funnels")
    .find({ projectId: { $in: projectIds } })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(1)
    .toArray();

  const savedFunnel = saved[0];
  if (savedFunnel && Array.isArray(savedFunnel.steps) && savedFunnel.steps.length >= 2) {
    return {
      name: savedFunnel.name || "Custom Funnel",
      steps: savedFunnel.steps
        .filter((step: any) => step?.event)
        .map((step: any) => ({ name: step.name || humanizeEventName(step.event), event: step.event })),
      source: "saved",
    };
  }

  // ── 2. Events that have actually arrived ──────────────────
  // Only observed events can appear in a funnel: a step nobody could
  // ever reach is not a drop-off, it is a missing integration.
  const observed = await db
    .collection("events")
    .aggregate([
      { $match: { projectId: { $in: projectIds } } },
      {
        $group: {
          _id: "$eventName",
          users: { $addToSet: "$userId" },
          firstSeen: { $min: "$firstSeen" },
          category: { $first: "$category" },
          funnelStage: { $first: "$funnelStage" },
        },
      },
      { $project: { userCount: { $size: "$users" }, firstSeen: 1, category: 1, funnelStage: 1 } },
    ])
    .toArray();

  if (observed.length < 2) return null;

  // ── 3. Prefer the catalog's own stage/importance metadata ──
  const catalogEvents = await db
    .collection("detectedInteractions")
    .aggregate([
      { $match: { projectId: { $in: projectIds } } },
      {
        $group: {
          _id: "$eventName",
          funnelStage: { $first: "$funnelStage" },
          category: { $first: "$category" },
          importance: { $first: "$importance" },
        },
      },
    ])
    .toArray();

  const catalogByName = new Map(catalogEvents.map((entry) => [entry._id, entry]));
  const hasStageMetadata = observed.some(
    (entry) => catalogByName.get(entry._id)?.funnelStage || entry.funnelStage
  );

  const ranked = observed
    .map((entry) => {
      const catalog = catalogByName.get(entry._id);
      return {
        event: entry._id as string,
        userCount: entry.userCount as number,
        stage: (catalog?.funnelStage || entry.funnelStage) as string | undefined,
        firstSeen: entry.firstSeen as string | undefined,
      };
    })
    .sort((a, b) => {
      if (hasStageMetadata) {
        const stageDiff = stageRank(a.stage) - stageRank(b.stage);
        if (stageDiff !== 0) return stageDiff;
      }
      // Within a stage (or with no stage data at all) a funnel narrows,
      // so the broadest event comes first.
      if (b.userCount !== a.userCount) return b.userCount - a.userCount;
      return String(a.firstSeen ?? "").localeCompare(String(b.firstSeen ?? ""));
    });

  const steps = ranked.slice(0, maxSteps).map((entry) => ({
    name: humanizeEventName(entry.event),
    event: entry.event,
  }));

  if (steps.length < 2) return null;

  return {
    name: options.funnelName || "Observed User Journey",
    steps,
    source: hasStageMetadata ? "derived-from-catalog" : "derived-from-events",
  };
}

/**
 * The funnel arithmetic, separated from the database so it can be
 * tested directly against known counts.
 *
 * `percent` is measured against the first step (how far through the
 * whole journey users got). `dropFromPrevious` is measured against the
 * immediately preceding step — the rate a developer means when they ask
 * "how many people fall out *here*".
 */
export function computeFunnelMetrics(
  counts: Array<{ name: string; event: string; users: number }>,
  definition: Pick<FunnelDefinition, "name" | "source">
): FunnelResult {
  const base = counts[0]?.users ?? 0;

  const steps: FunnelStepResult[] = counts.map((step, index) => {
    const previous = index > 0 ? counts[index - 1].users : step.users;
    return {
      ...step,
      percent: base > 0 ? round1((step.users / base) * 100) : 0,
      drop: index > 0 && base > 0 ? round1(((previous - step.users) / base) * 100) : 0,
      dropFromPrevious:
        index > 0 && previous > 0 ? round1(((previous - step.users) / previous) * 100) : 0,
    };
  });

  let largestDropoff: FunnelResult["largestDropoff"] = null;
  if (base > 0) {
    for (let index = 1; index < steps.length; index += 1) {
      if (!largestDropoff || steps[index].dropFromPrevious > largestDropoff.rate) {
        largestDropoff = {
          from: steps[index - 1].name,
          to: steps[index].name,
          rate: steps[index].dropFromPrevious,
        };
      }
    }
  }

  const finalStep = steps[steps.length - 1];

  return {
    funnelName: definition.name,
    source: definition.source,
    steps,
    conversionRate: base > 0 && finalStep ? round1((finalStep.users / base) * 100) : null,
    largestDropoff,
    atRiskCount:
      base > 0
        ? steps.filter((step, index) => index > 0 && step.dropFromPrevious >= AT_RISK_THRESHOLD).length
        : 0,
    totalUsers: base,
    insufficientData: base === 0,
  };
}

/**
 * Counts a funnel definition against real events.
 *
 * Each step counts the distinct users who emitted that event, so the
 * numbers match what the events collection can actually support.
 */
export async function computeFunnel(
  db: Db,
  projectIds: string[],
  definition: FunnelDefinition
): Promise<FunnelResult> {
  const counts: Array<{ name: string; event: string; users: number }> = [];

  for (const step of definition.steps) {
    const users = await db.collection("events").distinct("userId", {
      projectId: { $in: projectIds },
      eventName: step.event,
    });
    counts.push({ name: step.name, event: step.event, users: users.length });
  }

  return computeFunnelMetrics(counts, definition);
}

/**
 * Derives and counts in one call. Returns null when the project has no
 * data to build a funnel from — callers must render that as
 * "Insufficient data", never as a zero-valued funnel.
 */
export async function resolveFunnel(
  db: Db,
  projectIds: string[],
  options: { maxSteps?: number; funnelName?: string } = {}
): Promise<FunnelResult | null> {
  if (projectIds.length === 0) return null;
  const definition = await deriveFunnelDefinition(db, projectIds, options);
  if (!definition) return null;
  return computeFunnel(db, projectIds, definition);
}

/** Formats a rate for display, or the honest absence of one. */
export function formatRate(rate: number | null): string {
  return rate === null ? "Insufficient data" : `${rate.toFixed(1)}%`;
}
