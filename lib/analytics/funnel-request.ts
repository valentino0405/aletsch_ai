// ============================================================
// Aletsch AI — Funnel request parsing
// ------------------------------------------------------------
// Turns an untrusted request body into a `FunnelQuery`, or an error the
// UI can show a developer.
//
// Kept separate from the route, and pure, for two reasons: the rules are
// testable without an HTTP server, and every rejection produces a
// sentence written for a person ("A funnel needs at least two steps")
// rather than a schema dump.
//
// `projectId` is deliberately *not* parsed here. Authorisation is the
// route's job, via lib/analytics/scope.ts, and keeping it out of this
// module means no caller can mistake a parsed query for an authorised one.
// ============================================================

import type { FunnelQuery, FunnelStepSpec, TimeUnit } from "./types";
import { FilterValidationError, parseFilters, isKnownField } from "./filters";
import {
  AnalyticsRangeError,
  DEFAULT_CONVERSION_WINDOW_MS,
  MAX_CONVERSION_WINDOW_MS,
  resolveDateRange,
  toMilliseconds,
} from "./time";
import { MAX_FUNNEL_STEPS, MIN_FUNNEL_STEPS } from "./funnel-engine";

export class FunnelRequestError extends Error {}

const TIME_UNITS: TimeUnit[] = ["minutes", "hours", "days"];
const MAX_STEP_NAME_LENGTH = 80;
const MAX_EVENT_NAME_LENGTH = 120;

export interface ParseOptions {
  now?: Date;
}

/**
 * Parse and validate a funnel request body.
 *
 * Throws `FunnelRequestError` with a readable message on anything
 * unusable. Nothing is silently corrected: a step the parser cannot
 * understand would otherwise produce a funnel that answers a different
 * question from the one the developer asked.
 */
export function parseFunnelRequest(body: unknown, options: ParseOptions = {}): FunnelQuery {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new FunnelRequestError("The request body must be a funnel definition.");
  }

  const input = body as Record<string, unknown>;

  const steps = parseSteps(input.steps);
  const range = parseRange(input, options.now);
  const conversionWindowMs = parseConversionWindow(input);
  const breakdown = parseBreakdown(input.breakdown);

  let filters;
  try {
    filters = parseFilters(input.filters, "the global filters");
  } catch (error) {
    if (error instanceof FilterValidationError) throw new FunnelRequestError(error.message);
    throw error;
  }

  return {
    steps,
    range,
    conversionWindowMs,
    funnelType: input.funnelType === "open" ? "open" : "closed",
    stepOrder: input.stepOrder === "any_order" ? "any_order" : "sequential",
    countMethod: "unique_users",
    filters,
    breakdown,
  };
}

function parseSteps(raw: unknown): FunnelStepSpec[] {
  if (!Array.isArray(raw)) {
    throw new FunnelRequestError("A funnel needs a list of steps.");
  }
  if (raw.length < MIN_FUNNEL_STEPS) {
    throw new FunnelRequestError(
      `A funnel needs at least ${MIN_FUNNEL_STEPS} steps to measure a conversion between them.`
    );
  }
  if (raw.length > MAX_FUNNEL_STEPS) {
    throw new FunnelRequestError(`A funnel is limited to ${MAX_FUNNEL_STEPS} steps.`);
  }

  return raw.map((entry, index) => parseStep(entry, index));
}

function parseStep(raw: unknown, index: number): FunnelStepSpec {
  const position = index + 1;

  // A bare string is accepted as shorthand for an unfiltered step.
  if (typeof raw === "string") {
    return { eventName: requireEventName(raw, position) };
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new FunnelRequestError(`Step ${position} is not a valid step definition.`);
  }

  const input = raw as Record<string, unknown>;
  // `event` is the key the saved-funnel documents already use.
  const eventName = requireEventName(
    typeof input.eventName === "string" ? input.eventName : (input.event as string),
    position
  );

  let filters;
  try {
    filters = parseFilters(input.filters, `the filters on step ${position}`);
  } catch (error) {
    if (error instanceof FilterValidationError) throw new FunnelRequestError(error.message);
    throw error;
  }

  const name = typeof input.name === "string" ? input.name.trim().slice(0, MAX_STEP_NAME_LENGTH) : "";

  return {
    eventName,
    name: name || undefined,
    filters: filters.length > 0 ? filters : undefined,
  };
}

function requireEventName(raw: unknown, position: number): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new FunnelRequestError(`Step ${position} needs an event to measure.`);
  }
  const eventName = raw.trim();
  if (eventName.length > MAX_EVENT_NAME_LENGTH) {
    throw new FunnelRequestError(`Step ${position} has an event name that is too long.`);
  }
  return eventName;
}

function parseRange(input: Record<string, unknown>, now?: Date) {
  try {
    return resolveDateRange(asOptionalString(input.dateRange), {
      startDate: asOptionalString(input.startDate),
      endDate: asOptionalString(input.endDate),
      now,
    });
  } catch (error) {
    if (error instanceof AnalyticsRangeError) throw new FunnelRequestError(error.message);
    throw error;
  }
}

/**
 * The conversion window, in milliseconds.
 *
 * Accepts either `conversionWindowMs` directly or the
 * `conversionWindow` + `conversionWindowUnit` pair the builder sends.
 */
function parseConversionWindow(input: Record<string, unknown>): number {
  if (typeof input.conversionWindowMs === "number") {
    return clampWindow(input.conversionWindowMs);
  }

  const value = input.conversionWindow;
  if (value === undefined || value === null || value === "") return DEFAULT_CONVERSION_WINDOW_MS;

  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) {
    throw new FunnelRequestError("The conversion window must be a number.");
  }

  const rawUnit = asOptionalString(input.conversionWindowUnit) ?? "days";
  if (!TIME_UNITS.includes(rawUnit as TimeUnit)) {
    throw new FunnelRequestError("The conversion window unit must be minutes, hours or days.");
  }

  return clampWindow(toMilliseconds(amount, rawUnit as TimeUnit));
}

function clampWindow(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new FunnelRequestError("The conversion window must be longer than zero.");
  }
  if (ms > MAX_CONVERSION_WINDOW_MS) {
    throw new FunnelRequestError("The conversion window is limited to 90 days.");
  }
  return Math.round(ms);
}

function parseBreakdown(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") {
    throw new FunnelRequestError("The breakdown must name a single field.");
  }
  const field = raw.trim();
  if (!field) return null;
  if (!isKnownField(field)) {
    throw new FunnelRequestError(`"${field}" cannot be used as a breakdown.`);
  }
  return field;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Read a funnel request out of a query string, for GET callers. */
export function parseFunnelSearchParams(params: URLSearchParams, options: ParseOptions = {}): FunnelQuery {
  const stepsParam = params.get("steps");
  const steps = stepsParam
    ? stepsParam
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

  return parseFunnelRequest(
    {
      steps,
      dateRange: params.get("dateRange"),
      startDate: params.get("startDate"),
      endDate: params.get("endDate"),
      conversionWindow: params.get("conversionWindow"),
      conversionWindowUnit: params.get("conversionWindowUnit"),
      funnelType: params.get("funnelType"),
      stepOrder: params.get("stepOrder"),
      breakdown: params.get("breakdown"),
    },
    options
  );
}
