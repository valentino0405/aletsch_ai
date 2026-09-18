// ============================================================
// Aletsch AI — Sequential funnel engine
// ------------------------------------------------------------
// Pure functions over per-user event streams. No database, no clock, no
// randomness: the same events and the same query always produce the same
// numbers, which is the only reason these results can be trusted or
// tested.
//
// The engine is deliberately split in two:
//
//   buildUserJourney()      one user's traversal of the funnel
//   computeFunnelAnalysis() the arithmetic over all traversals
//
// The journey is the interesting part — ordering, repeated events, the
// conversion window and open/closed entry all resolve there — and it is
// a plain data structure, so every rule below can be tested against a
// handful of hand-written events.
// ============================================================

import type {
  AnalyticsEvent,
  FunnelAnalysis,
  FunnelBreakdownResult,
  FunnelStepAnalysis,
  FunnelStepSpec,
  FunnelType,
  StepOrder,
  UserEventStream,
  UserJourney,
} from "./types";
import { matchesFilters, readField } from "./filters";
import { mean, median, rate, round1 } from "./time";
import { humanizeEventName } from "./funnel";

export const MAX_FUNNEL_STEPS = 10;
export const MIN_FUNNEL_STEPS = 2;
export const DEFAULT_BREAKDOWN_LIMIT = 12;

export interface JourneyOptions {
  conversionWindowMs: number;
  funnelType: FunnelType;
  stepOrder: StepOrder;
  /** Dimensions to capture from the entry event, for breakdowns. */
  dimensions?: string[];
}

/**
 * Build one user's journey through the funnel, or null if they never
 * entered it.
 *
 * ── Ordering (sequential) ──────────────────────────────────
 * Each step must be satisfied by an event that occurs *after* the event
 * that satisfied the previous step. A user who fires the steps in the
 * wrong order has not completed the funnel: signup → project_created →
 * login, measured against [signup, login, project_created], reaches step
 * two and stops, because no project_created follows the login.
 *
 * Progression is tracked by position in the stream rather than by
 * timestamp, so two events recorded in the same millisecond still
 * advance the funnel in the order they were received.
 *
 * ── Repeated events ───────────────────────────────────────
 * A step is satisfied by the *earliest* qualifying occurrence, and once
 * satisfied it is never revisited. Firing `add_to_cart` nine times
 * counts once and advances the funnel from the first of them. Counting
 * the latest occurrence instead would let a user's later activity
 * retroactively shrink their own time-to-convert.
 *
 * ── Conversion window ─────────────────────────────────────
 * The deadline is anchored to funnel *entry*, not to the previous step,
 * and is measured in elapsed time rather than calendar days. A step
 * landing exactly on the deadline counts; one millisecond later does not.
 *
 * ── Entry (closed vs open) ────────────────────────────────
 * Closed funnels are entered only at step one. Open funnels are entered
 * at whichever step the user first appears in — if two steps match the
 * same event, the earlier step wins, so entry is never ambiguous.
 */
export function buildUserJourney(
  stream: UserEventStream,
  steps: FunnelStepSpec[],
  options: JourneyOptions
): UserJourney | null {
  if (steps.length === 0 || stream.events.length === 0) return null;

  const entry = findEntry(stream.events, steps, options.funnelType);
  if (!entry) return null;

  const entryEvent = stream.events[entry.eventIndex];
  const deadline = entryEvent.timestamp + options.conversionWindowMs;

  const stepTimes =
    options.stepOrder === "any_order"
      ? traverseAnyOrder(stream.events, steps, entry, deadline)
      : traverseSequential(stream.events, steps, entry, deadline);

  return {
    userId: stream.userId,
    entryStep: entry.stepIndex,
    stepTimes,
    dimensions: captureDimensions(entryEvent, options.dimensions),
  };
}

interface EntryPoint {
  stepIndex: number;
  eventIndex: number;
}

function findEntry(
  events: AnalyticsEvent[],
  steps: FunnelStepSpec[],
  funnelType: FunnelType
): EntryPoint | null {
  if (funnelType === "closed") {
    for (let i = 0; i < events.length; i += 1) {
      if (eventMatchesStep(events[i], steps[0])) return { stepIndex: 0, eventIndex: i };
    }
    return null;
  }

  // Open: the first event that matches any step opens the funnel. When
  // one event satisfies several steps, the earliest step is chosen so a
  // user is never credited with skipping ahead.
  for (let i = 0; i < events.length; i += 1) {
    for (let s = 0; s < steps.length; s += 1) {
      if (eventMatchesStep(events[i], steps[s])) return { stepIndex: s, eventIndex: i };
    }
  }
  return null;
}

/** Walk forward, one step at a time, stopping at the first step not met. */
function traverseSequential(
  events: AnalyticsEvent[],
  steps: FunnelStepSpec[],
  entry: EntryPoint,
  deadline: number
): number[] {
  const stepTimes: number[] = [events[entry.eventIndex].timestamp];
  let cursor = entry.eventIndex;

  for (let stepIndex = entry.stepIndex + 1; stepIndex < steps.length; stepIndex += 1) {
    let matchedAt = -1;

    for (let i = cursor + 1; i < events.length; i += 1) {
      const event = events[i];
      // Streams are chronological, so the first event past the deadline
      // means every later one is too.
      if (event.timestamp > deadline) break;
      if (eventMatchesStep(event, steps[stepIndex])) {
        matchedAt = i;
        break;
      }
    }

    if (matchedAt === -1) break;
    stepTimes.push(events[matchedAt].timestamp);
    cursor = matchedAt;
  }

  return stepTimes;
}

/**
 * Order-independent traversal: every step must happen inside the window,
 * but not necessarily in the declared order.
 *
 * Each step consumes a distinct event, so a funnel listing the same
 * event twice still requires two occurrences. Recorded times are
 * monotonic — a step's time is "the moment this user had completed every
 * step up to here" — which keeps the inter-step gaps non-negative even
 * when the underlying events arrived out of order.
 */
function traverseAnyOrder(
  events: AnalyticsEvent[],
  steps: FunnelStepSpec[],
  entry: EntryPoint,
  deadline: number
): number[] {
  const entryTime = events[entry.eventIndex].timestamp;
  const consumed = new Set<number>([entry.eventIndex]);
  const stepTimes: number[] = [entryTime];
  let highWater = entryTime;

  for (let stepIndex = entry.stepIndex + 1; stepIndex < steps.length; stepIndex += 1) {
    let matchedAt = -1;

    for (let i = 0; i < events.length; i += 1) {
      if (consumed.has(i)) continue;
      const event = events[i];
      if (event.timestamp < entryTime) continue;
      if (event.timestamp > deadline) break;
      if (eventMatchesStep(event, steps[stepIndex])) {
        matchedAt = i;
        break;
      }
    }

    if (matchedAt === -1) break;
    consumed.add(matchedAt);
    highWater = Math.max(highWater, events[matchedAt].timestamp);
    stepTimes.push(highWater);
  }

  return stepTimes;
}

export function eventMatchesStep(event: AnalyticsEvent, step: FunnelStepSpec): boolean {
  if (event.eventName !== step.eventName) return false;
  return matchesFilters(event, step.filters);
}

function captureDimensions(event: AnalyticsEvent, fields: string[] | undefined): Record<string, string> {
  if (!fields || fields.length === 0) return {};
  const out: Record<string, string> = {};
  for (const field of fields) {
    const value = readField(event, field);
    if (value !== null && value !== "") out[field] = value;
  }
  return out;
}

/** Build every journey in one pass over the loaded streams. */
export function buildJourneys(
  streams: UserEventStream[],
  steps: FunnelStepSpec[],
  options: JourneyOptions
): UserJourney[] {
  const journeys: UserJourney[] = [];
  for (const stream of streams) {
    const journey = buildUserJourney(stream, steps, options);
    if (journey) journeys.push(journey);
  }
  return journeys;
}

// ────────────────────────────────────────────────────────────
// Metrics
// ────────────────────────────────────────────────────────────

export interface AnalysisContext {
  /** Any event at all in the window, for this project. */
  anyEventsInRange: boolean;
  /** Any event matching one of the funnel's step names. */
  anyStepEventsInRange: boolean;
}

/**
 * Turn journeys into the funnel's published metrics.
 *
 * Nothing here is clamped. A later step reached by more users than the
 * one before it — possible in an open funnel, or when a user emits a
 * later event without the earlier one — is reported as a negative
 * drop-off rather than rounded to zero, because hiding it would hide a
 * real instrumentation problem.
 */
export function computeFunnelAnalysis(
  journeys: UserJourney[],
  steps: FunnelStepSpec[],
  context: AnalysisContext = { anyEventsInRange: true, anyStepEventsInRange: true }
): FunnelAnalysis {
  const stepCount = steps.length;

  if (stepCount === 0) {
    return emptyAnalysis([], resolveDataState(0, context));
  }

  // A journey entering at step e and completing k steps covers the
  // half-open index range [e, e + k).
  const stepUsers = new Array<number>(stepCount).fill(0);
  const gapsByStep: number[][] = Array.from({ length: stepCount }, () => []);
  const timesToConvert: number[] = [];

  const finalIndex = stepCount - 1;

  for (const journey of journeys) {
    const reachedThrough = journey.entryStep + journey.stepTimes.length;

    for (let index = journey.entryStep; index < reachedThrough && index < stepCount; index += 1) {
      stepUsers[index] += 1;

      // The gap into this step only exists if the previous step was part
      // of the same journey; a user who entered an open funnel at step
      // three has no measurable step two → step three transition.
      if (index > journey.entryStep) {
        const offset = index - journey.entryStep;
        const delta = journey.stepTimes[offset] - journey.stepTimes[offset - 1];
        if (Number.isFinite(delta) && delta >= 0) gapsByStep[index].push(delta);
      }
    }

    if (reachedThrough > finalIndex) {
      const total = journey.stepTimes[journey.stepTimes.length - 1] - journey.stepTimes[0];
      if (Number.isFinite(total) && total >= 0) timesToConvert.push(total);
    }
  }

  const totalUsers = journeys.length;
  const convertedUsers = stepUsers[finalIndex];
  const entryUsers = stepUsers[0];

  const analysedSteps: FunnelStepAnalysis[] = steps.map((step, index) => {
    const users = stepUsers[index];
    const previous = index === 0 ? null : stepUsers[index - 1];
    const dropOffUsers = previous === null ? 0 : previous - users;

    return {
      order: index + 1,
      name: stepLabel(step),
      eventName: step.eventName,
      users,
      conversionRate: previous === null ? null : rate(users, previous),
      percentOfEntry: rate(users, entryUsers) ?? 0,
      dropOffUsers,
      dropOffRate: previous === null ? 0 : rate(dropOffUsers, previous) ?? 0,
      averageTimeFromPreviousMs: roundMs(mean(gapsByStep[index])),
      medianTimeFromPreviousMs: roundMs(median(gapsByStep[index])),
    };
  });

  return {
    steps: analysedSteps,
    totalUsers,
    convertedUsers,
    overallConversionRate: rate(convertedUsers, totalUsers),
    averageTimeToConvertMs: roundMs(mean(timesToConvert)),
    medianTimeToConvertMs: roundMs(median(timesToConvert)),
    largestDropOff: findLargestDropOff(analysedSteps, stepUsers),
    dataState: resolveDataState(totalUsers, context),
  };
}

function stepLabel(step: FunnelStepSpec): string {
  const explicit = step.name?.trim();
  return explicit || humanizeEventName(step.eventName);
}

function roundMs(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

/**
 * The steepest step-to-step loss, as a share of the step before it.
 *
 * Rate rather than headcount: losing 200 of 1,000 at the top of the
 * funnel is ordinary, while losing 200 of 220 further down is where the
 * product is broken. Ties resolve to the earlier step, since fixing the
 * earliest failure recovers the most users downstream.
 */
function findLargestDropOff(
  steps: FunnelStepAnalysis[],
  stepUsers: number[]
): FunnelAnalysis["largestDropOff"] {
  let best: FunnelAnalysis["largestDropOff"] = null;

  for (let index = 1; index < steps.length; index += 1) {
    const previousUsers = stepUsers[index - 1];
    if (previousUsers <= 0) continue;

    const current = steps[index];
    if (best === null || current.dropOffRate > best.rate) {
      best = {
        fromStep: index,
        toStep: index + 1,
        fromEvent: steps[index - 1].eventName,
        toEvent: current.eventName,
        fromName: steps[index - 1].name,
        toName: current.name,
        users: current.dropOffUsers,
        rate: round1(current.dropOffRate),
      };
    }
  }

  return best;
}

/**
 * Why there are no numbers.
 *
 * "Nobody converted" and "nothing was ever recorded" are both zero on a
 * chart and opposite findings in practice, so they are never merged.
 */
function resolveDataState(totalUsers: number, context: AnalysisContext): FunnelAnalysis["dataState"] {
  if (totalUsers > 0) return "ok";
  if (!context.anyEventsInRange) return "no_events";
  if (!context.anyStepEventsInRange) return "no_step_events";
  return "no_entries";
}

function emptyAnalysis(steps: FunnelStepAnalysis[], dataState: FunnelAnalysis["dataState"]): FunnelAnalysis {
  return {
    steps,
    totalUsers: 0,
    convertedUsers: 0,
    overallConversionRate: null,
    averageTimeToConvertMs: null,
    medianTimeToConvertMs: null,
    largestDropOff: null,
    dataState,
  };
}

// ────────────────────────────────────────────────────────────
// Breakdowns
// ────────────────────────────────────────────────────────────

/**
 * Segment the funnel by a dimension read from each user's entry event.
 *
 * Entry rather than per-step, deliberately: a user who starts on mobile
 * and converts on desktop belongs to exactly one bucket, so the buckets
 * sum to the funnel total instead of double-counting.
 *
 * When no journey carries the dimension the result is `available: false`
 * with a reason. The UI shows that sentence. It does not invent buckets.
 */
export function computeFunnelBreakdown(
  journeys: UserJourney[],
  field: string,
  stepCount: number,
  options: { limit?: number; availableInRange?: boolean } = {}
): FunnelBreakdownResult {
  const limit = options.limit ?? DEFAULT_BREAKDOWN_LIMIT;
  const finalIndex = stepCount - 1;

  const buckets = new Map<string, { users: number; converted: number }>();
  let unknownUsers = 0;

  for (const journey of journeys) {
    const value = journey.dimensions[field];
    if (value === undefined || value === "") {
      unknownUsers += 1;
      continue;
    }

    const bucket = buckets.get(value) ?? { users: 0, converted: 0 };
    bucket.users += 1;
    if (journey.entryStep + journey.stepTimes.length > finalIndex) bucket.converted += 1;
    buckets.set(value, bucket);
  }

  const available = options.availableInRange ?? buckets.size > 0;

  if (!available || buckets.size === 0) {
    return {
      field,
      available: false,
      buckets: [],
      unknownUsers,
      reason:
        journeys.length === 0
          ? `No users entered the funnel, so there is nothing to break down by ${field}.`
          : `No ${field} data available on the events in this range.`,
    };
  }

  const rows = [...buckets.entries()]
    .map(([value, bucket]) => ({
      value,
      users: bucket.users,
      convertedUsers: bucket.converted,
      conversionRate: rate(bucket.converted, bucket.users),
      dropOffUsers: bucket.users - bucket.converted,
    }))
    .sort((a, b) => b.users - a.users || a.value.localeCompare(b.value));

  return {
    field,
    available: true,
    buckets: rows.slice(0, limit),
    unknownUsers,
  };
}
