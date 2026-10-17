// ============================================================
// Aletsch AI — Shared analytics types
// ------------------------------------------------------------
// One event stream, many engines. Every analytics surface in Aletsch
// (funnels, trends, paths, retention, stickiness, lifecycle) reads the
// same `events` collection through the same loader and the same filter
// vocabulary, so two pages can never disagree about what happened.
//
// Nothing in this file touches the database. These are the shapes the
// pure engines and the API routes agree on.
// ============================================================

// ────────────────────────────────────────────────────────────
// Filtering
// ────────────────────────────────────────────────────────────

/**
 * Fields a filter or breakdown may address.
 *
 * Top-level names map to columns on the event document. Anything
 * prefixed `properties.` addresses a key inside the event's own
 * sanitised property bag, which is where application-specific
 * dimensions (`plan`, `projectType`, ...) live.
 */
export const FILTERABLE_FIELDS = [
  "path",
  "category",
  "referrer",
  "device",
  "browser",
  "os",
  "country",
  "source",
  "sessionId",
] as const;

export type FilterableField = (typeof FILTERABLE_FIELDS)[number] | `properties.${string}`;

export type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "in"
  | "is_set"
  | "is_not_set";

export interface PropertyFilter {
  field: string;
  operator: FilterOperator;
  /** Absent for `is_set` / `is_not_set`. */
  value?: string | number | boolean | Array<string | number | boolean>;
}

// ────────────────────────────────────────────────────────────
// The event as the engines see it
// ────────────────────────────────────────────────────────────

/**
 * A single ingested event, flattened to what analytics needs.
 *
 * `timestamp` is milliseconds since epoch. The database stores an ISO
 * string (see /api/ingest); the loader parses it once so no engine has
 * to think about string dates or time zones again.
 */
export interface AnalyticsEvent {
  userId: string;
  sessionId: string;
  eventName: string;
  timestamp: number;
  path: string;
  category: string;
  referrer: string;
  /** Server-derived or client-declared context; absent on older events. */
  device?: string;
  browser?: string;
  os?: string;
  country?: string;
  /** "web" for real traffic, "synthetic" for generated demo data. */
  source?: string;
  properties: Record<string, string | number | boolean>;
}

/** All of one user's events in this window, ascending by timestamp. */
export interface UserEventStream {
  userId: string;
  events: AnalyticsEvent[];
}

// ────────────────────────────────────────────────────────────
// Time
// ────────────────────────────────────────────────────────────

export type DateRangeKey = "24h" | "7d" | "30d" | "90d" | "custom";

export interface ResolvedDateRange {
  key: DateRangeKey;
  label: string;
  /** Inclusive lower bound, ISO-8601 UTC. */
  startIso: string;
  /** Exclusive upper bound, ISO-8601 UTC. */
  endIso: string;
  startMs: number;
  endMs: number;
  /** Whole days spanned, for bucketing. */
  days: number;
}

export type TimeUnit = "minutes" | "hours" | "days";

export type Granularity = "hour" | "day" | "week" | "month";

// ────────────────────────────────────────────────────────────
// Funnels
// ────────────────────────────────────────────────────────────

/**
 * `closed` — the user must enter at step one. Someone whose first
 *   matching event is step three never entered the funnel.
 * `open`  — the user may enter at whichever step they first match, and
 *   is counted from there onwards.
 */
export type FunnelType = "closed" | "open";

/**
 * `sequential` — steps must occur in the declared order.
 * `any_order`  — the steps must all occur inside the conversion window,
 *   but their order is not required.
 */
export type StepOrder = "sequential" | "any_order";

/** Only unique users for now. Totals/sessions would change every rate below. */
export type CountMethod = "unique_users";

export interface FunnelStepSpec {
  eventName: string;
  /** Display label. Derived from the event name when omitted. */
  name?: string;
  /** Conditions the matching event must also satisfy. */
  filters?: PropertyFilter[];
}

export interface FunnelQuery {
  steps: FunnelStepSpec[];
  range: ResolvedDateRange;
  /** Milliseconds allowed between funnel entry and the final step. */
  conversionWindowMs: number;
  funnelType: FunnelType;
  stepOrder: StepOrder;
  countMethod: CountMethod;
  /** Applied to every event before any step matching. */
  filters: PropertyFilter[];
  /** Field to segment the funnel by, e.g. "device" or "properties.plan". */
  breakdown: string | null;
}

/**
 * One user's traversal of one funnel.
 *
 * `stepTimes[i]` is when the user satisfied step `entryStep + i`, so
 * `stepTimes.length` is how many steps they completed from their entry
 * point. This is the only structure the metric arithmetic reads, which
 * is what makes the arithmetic testable without a database.
 */
export interface UserJourney {
  userId: string;
  /** Zero-based index of the step this user entered at. Always 0 when closed. */
  entryStep: number;
  /** Epoch ms for each consecutive step reached, starting at `entryStep`. */
  stepTimes: number[];
  /** Dimension values read from the user's entry event, for breakdowns. */
  dimensions: Record<string, string>;
}

export interface FunnelStepAnalysis {
  /** One-based position in the funnel. */
  order: number;
  name: string;
  eventName: string;
  users: number;
  /** Users here as a share of the previous step, 0–100. Null on step one. */
  conversionRate: number | null;
  /** Users here as a share of step one, 0–100. */
  percentOfEntry: number;
  /** Users lost between the previous step and this one. Zero on step one. */
  dropOffUsers: number;
  /** Those losses as a share of the previous step, 0–100. */
  dropOffRate: number;
  /** Mean gap from the previous step, over users who reached this step. */
  averageTimeFromPreviousMs: number | null;
  medianTimeFromPreviousMs: number | null;
}

/**
 * Why a result has no numbers in it.
 *
 * The distinction matters: "nobody converted" and "nothing was ever
 * measured" look identical as 0% but mean opposite things to a
 * developer, so they are never collapsed into one another.
 */
export type FunnelDataState =
  | "ok"
  | "no_events"
  | "no_step_events"
  | "no_entries";

export interface FunnelAnalysis {
  steps: FunnelStepAnalysis[];
  /** Users who entered the funnel — i.e. reached step one. */
  totalUsers: number;
  /** Users who reached the final step. */
  convertedUsers: number;
  /** convertedUsers / totalUsers, 0–100. Null when nobody entered. */
  overallConversionRate: number | null;
  averageTimeToConvertMs: number | null;
  medianTimeToConvertMs: number | null;
  largestDropOff: {
    fromStep: number;
    toStep: number;
    fromEvent: string;
    toEvent: string;
    fromName: string;
    toName: string;
    users: number;
    rate: number;
  } | null;
  dataState: FunnelDataState;
}

export interface FunnelBreakdownBucket {
  value: string;
  users: number;
  convertedUsers: number;
  conversionRate: number | null;
  dropOffUsers: number;
}

export interface FunnelBreakdownResult {
  field: string;
  /** False when no event in the window carried this dimension at all. */
  available: boolean;
  buckets: FunnelBreakdownBucket[];
  /** Users whose entry event carried no value for this dimension. */
  unknownUsers: number;
  reason?: string;
}

export interface FunnelRunMeta {
  projectIds: string[];
  range: { key: DateRangeKey; label: string; startIso: string; endIso: string };
  conversionWindowMs: number;
  funnelType: FunnelType;
  stepOrder: StepOrder;
  countMethod: CountMethod;
  /** Events read from the database for this run. */
  eventsScanned: number;
  /** Distinct users seen in the window, before funnel entry is considered. */
  usersScanned: number;
  /** True when the loader hit its cap and the result is a partial read. */
  truncated: boolean;
  /** Events discarded because a required field was missing or unusable. */
  malformedEvents: number;
  /** How many of the scanned events were generated demo data. */
  syntheticEvents: number;
  executionMs: number;
}

export interface FunnelRunResult extends FunnelAnalysis {
  definition: {
    name: string;
    source: "saved" | "custom" | "derived-from-catalog" | "derived-from-events";
    steps: Array<{ order: number; name: string; eventName: string; filters: PropertyFilter[] }>;
  };
  breakdown: FunnelBreakdownResult | null;
  meta: FunnelRunMeta;
}
