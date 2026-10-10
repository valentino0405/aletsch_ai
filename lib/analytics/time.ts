// ============================================================
// Aletsch AI — Analytics time utilities
// ------------------------------------------------------------
// Every date in the analytics path is UTC and every duration is
// milliseconds. Conversions to a user's local time belong in the
// browser, never in a stored value or a query.
//
// Events persist `timestamp` as an ISO-8601 UTC string produced by
// `new Date(...).toISOString()`, which is fixed-width and zero-padded.
// Lexicographic order on that format is chronological order, so range
// filters are plain string comparisons that an index can serve. The
// rest of the codebase already relies on this (see computeTrends).
// ============================================================

import type { DateRangeKey, Granularity, ResolvedDateRange, TimeUnit } from "./types";

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Preset windows offered by the UI, in hours. */
export const DATE_RANGE_PRESETS: Record<Exclude<DateRangeKey, "custom">, { hours: number; label: string }> = {
  "24h": { hours: 24, label: "Last 24 hours" },
  "7d": { hours: 24 * 7, label: "Last 7 days" },
  "30d": { hours: 24 * 30, label: "Last 30 days" },
  "90d": { hours: 24 * 90, label: "Last 90 days" },
};

export const DEFAULT_DATE_RANGE: DateRangeKey = "30d";

/** Conversion windows offered by the UI. The spec calls for 1/7/14/30 days. */
export const CONVERSION_WINDOW_PRESETS = [
  { value: 1, unit: "hours" as TimeUnit, label: "1 hour" },
  { value: 1, unit: "days" as TimeUnit, label: "1 day" },
  { value: 7, unit: "days" as TimeUnit, label: "7 days" },
  { value: 14, unit: "days" as TimeUnit, label: "14 days" },
  { value: 30, unit: "days" as TimeUnit, label: "30 days" },
];

export const DEFAULT_CONVERSION_WINDOW_MS = 14 * DAY_MS;

/** A conversion window longer than this is almost certainly a mistake. */
export const MAX_CONVERSION_WINDOW_MS = 90 * DAY_MS;

/** Refuse ranges longer than this so one request cannot scan years of data. */
export const MAX_RANGE_MS = 366 * DAY_MS;

export function toMilliseconds(value: number, unit: TimeUnit): number {
  switch (unit) {
    case "minutes":
      return value * MINUTE_MS;
    case "hours":
      return value * HOUR_MS;
    case "days":
      return value * DAY_MS;
  }
}

/**
 * Turn a preset key, or an explicit pair of dates, into the single range
 * object that both the query and the response carry.
 *
 * `now` is injectable so tests are not clock-dependent.
 */
export function resolveDateRange(
  key: string | null | undefined,
  options: { startDate?: string | null; endDate?: string | null; now?: Date } = {}
): ResolvedDateRange {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();

  if (key === "custom" || (!key && (options.startDate || options.endDate))) {
    const startMs = parseDateBoundary(options.startDate, nowMs - DATE_RANGE_PRESETS["30d"].hours * HOUR_MS);
    // An end date arrives as a calendar day; make it inclusive by pushing
    // the exclusive bound to the end of that day.
    const endMs = parseDateBoundary(options.endDate, nowMs, { endOfDayIfDateOnly: true });

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      throw new AnalyticsRangeError("Start and end dates must be valid dates.");
    }
    if (endMs <= startMs) {
      throw new AnalyticsRangeError("The end date must be after the start date.");
    }
    if (endMs - startMs > MAX_RANGE_MS) {
      throw new AnalyticsRangeError("Date ranges are limited to one year.");
    }

    return buildRange("custom", "Custom range", startMs, endMs);
  }

  const presetKey = (key && key in DATE_RANGE_PRESETS ? key : DEFAULT_DATE_RANGE) as Exclude<DateRangeKey, "custom">;
  const preset = DATE_RANGE_PRESETS[presetKey];
  return buildRange(presetKey, preset.label, nowMs - preset.hours * HOUR_MS, nowMs);
}

export class AnalyticsRangeError extends Error {}

function parseDateBoundary(
  raw: string | null | undefined,
  fallbackMs: number,
  options: { endOfDayIfDateOnly?: boolean } = {}
): number {
  if (!raw) return fallbackMs;
  const trimmed = raw.trim();
  if (!trimmed) return fallbackMs;

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const parsed = Date.parse(dateOnly ? `${trimmed}T00:00:00.000Z` : trimmed);
  if (!Number.isFinite(parsed)) return NaN;

  if (dateOnly && options.endOfDayIfDateOnly) return parsed + DAY_MS;
  return parsed;
}

function buildRange(key: DateRangeKey, label: string, startMs: number, endMs: number): ResolvedDateRange {
  return {
    key,
    label,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
    startMs,
    endMs,
    days: Math.max(1, Math.ceil((endMs - startMs) / DAY_MS)),
  };
}

/**
 * The Mongo predicate for a range.
 *
 * Lower bound inclusive, upper bound exclusive, so adjacent ranges tile
 * without double-counting the boundary event.
 */
export function timestampRangeMatch(range: ResolvedDateRange): { timestamp: { $gte: string; $lt: string } } {
  return { timestamp: { $gte: range.startIso, $lt: range.endIso } };
}

/**
 * Parse whatever a stored timestamp turns out to be.
 *
 * Ingest writes ISO strings, but a document written by an older path or
 * an external import may hold a Date or an epoch number. Analytics should
 * degrade to "skip this event", never to NaN arithmetic.
 */
export function parseEventTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/** Pick a sensible bucket size so a chart never renders 2,160 columns. */
export function defaultGranularity(range: ResolvedDateRange): Granularity {
  if (range.days <= 2) return "hour";
  if (range.days <= 62) return "day";
  if (range.days <= 365) return "week";
  return "month";
}

/**
 * Truncate an instant to the start of its bucket, in UTC.
 *
 * Weeks start Monday, matching ISO-8601 rather than the US convention.
 */
export function truncateToGranularity(ms: number, granularity: Granularity): number {
  const date = new Date(ms);
  switch (granularity) {
    case "hour":
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours());
    case "day":
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    case "week": {
      const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
      // getUTCDay() is 0 for Sunday; shift so Monday is 0.
      const offset = (new Date(dayStart).getUTCDay() + 6) % 7;
      return dayStart - offset * DAY_MS;
    }
    case "month":
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  }
}

export function advanceGranularity(ms: number, granularity: Granularity): number {
  if (granularity === "month") {
    const date = new Date(ms);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  }
  if (granularity === "week") return ms + 7 * DAY_MS;
  if (granularity === "day") return ms + DAY_MS;
  return ms + HOUR_MS;
}

/** The UTC calendar day an instant falls in, as `YYYY-MM-DD`. */
export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// ────────────────────────────────────────────────────────────
// Statistics
// ────────────────────────────────────────────────────────────

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/**
 * The median, averaging the two middle values on an even count.
 *
 * Sorts a copy: callers pass arrays they still need in arrival order.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/** One decimal place, the precision used throughout the dashboard. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * A rate as a percentage, or null when the denominator is zero.
 *
 * Zero users is not zero percent — it is nothing to measure — and the
 * whole UI depends on being able to tell those apart.
 */
export function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return round1((numerator / denominator) * 100);
}

/** Compact, human duration: "1d 4h", "12m 45s", "820ms". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;

  const totalSeconds = Math.round(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  return `${seconds}s`;
}
