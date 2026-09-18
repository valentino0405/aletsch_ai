// ============================================================
// Aletsch AI — Analytics filters
// ------------------------------------------------------------
// One filter vocabulary, evaluated in one place. Filters are matched in
// JavaScript against already-loaded events rather than translated into
// Mongo predicates, because a funnel step's filter has to be evaluated
// per-step against a user's ordered stream, not as a collection-wide
// $match. Keeping both paths on the same matcher means a step filter and
// a global filter can never disagree.
//
// The global filters are additionally narrowed at the database level
// where it is safe to do so (see `globalFilterMatch`), which keeps the
// scan small without changing the result.
// ============================================================

import type { AnalyticsEvent, PropertyFilter } from "./types";
import { FILTERABLE_FIELDS } from "./types";

export const MAX_FILTERS = 20;

const OPERATORS = new Set([
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "in",
  "is_set",
  "is_not_set",
]);

const OPERATORS_WITHOUT_VALUE = new Set(["is_set", "is_not_set"]);

/** Human labels for the field picker. */
export const BREAKDOWN_FIELDS: Array<{ field: string; label: string }> = [
  { field: "device", label: "Device type" },
  { field: "browser", label: "Browser" },
  { field: "os", label: "Operating system" },
  { field: "country", label: "Country" },
  { field: "path", label: "Page / route" },
  { field: "referrer", label: "Referrer" },
  { field: "category", label: "Event category" },
  { field: "source", label: "Traffic source" },
];

/**
 * Read a filterable field off an event.
 *
 * Returns null for "absent", which is distinct from the empty string:
 * `referrer: ""` means a direct visit, which is a real answer, while a
 * missing `country` means we never learned one.
 */
export function readField(event: AnalyticsEvent, field: string): string | null {
  if (field.startsWith("properties.")) {
    const key = field.slice("properties.".length);
    if (!key) return null;
    const value = event.properties?.[key];
    if (value === undefined || value === null) return null;
    return String(value);
  }

  switch (field) {
    case "path":
      return event.path ?? null;
    case "category":
      return event.category ?? null;
    case "referrer":
      return event.referrer ?? null;
    case "device":
      return event.device ?? null;
    case "browser":
      return event.browser ?? null;
    case "os":
      return event.os ?? null;
    case "country":
      return event.country ?? null;
    case "source":
      return event.source ?? null;
    case "sessionId":
      return event.sessionId ?? null;
    case "eventName":
      return event.eventName ?? null;
    default:
      return null;
  }
}

export function isKnownField(field: string): boolean {
  if (field.startsWith("properties.")) return field.length > "properties.".length;
  if (field === "eventName") return true;
  return (FILTERABLE_FIELDS as readonly string[]).includes(field);
}

/** Does this event satisfy every filter? An empty list matches everything. */
export function matchesFilters(event: AnalyticsEvent, filters: PropertyFilter[] | undefined): boolean {
  if (!filters || filters.length === 0) return true;
  for (const filter of filters) {
    if (!matchesFilter(event, filter)) return false;
  }
  return true;
}

export function matchesFilter(event: AnalyticsEvent, filter: PropertyFilter): boolean {
  const actual = readField(event, filter.field);

  if (filter.operator === "is_set") return actual !== null && actual !== "";
  if (filter.operator === "is_not_set") return actual === null || actual === "";

  // Every remaining operator compares against a value, and a missing
  // field cannot equal or contain anything. `not_equals` and
  // `not_contains` are the exception: an absent field is genuinely "not
  // equal to X", and treating it as a non-match would silently drop
  // events that the user meant to keep.
  if (actual === null) {
    return filter.operator === "not_equals" || filter.operator === "not_contains";
  }

  const haystack = actual.toLowerCase();

  switch (filter.operator) {
    case "equals":
      return toComparableList(filter.value).includes(haystack);
    case "not_equals":
      return !toComparableList(filter.value).includes(haystack);
    case "in":
      return toComparableList(filter.value).includes(haystack);
    case "contains":
      return toComparableList(filter.value).some((needle) => needle !== "" && haystack.includes(needle));
    case "not_contains":
      return !toComparableList(filter.value).some((needle) => needle !== "" && haystack.includes(needle));
    default:
      return true;
  }
}

function toComparableList(value: PropertyFilter["value"]): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map((entry) => String(entry).toLowerCase());
  return [String(value).toLowerCase()];
}

/**
 * Validate and normalise filters arriving from a client.
 *
 * Unknown fields and operators are rejected rather than ignored: a
 * silently dropped filter would show the user a number that does not
 * answer the question they asked.
 */
export function parseFilters(raw: unknown, context: string): PropertyFilter[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new FilterValidationError(`${context} must be a list of filters.`);
  }
  if (raw.length > MAX_FILTERS) {
    throw new FilterValidationError(`${context} is limited to ${MAX_FILTERS} filters.`);
  }

  const filters: PropertyFilter[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      throw new FilterValidationError(`${context} contains an entry that is not a filter.`);
    }

    const candidate = entry as Record<string, unknown>;
    const field = typeof candidate.field === "string" ? candidate.field.trim() : "";
    const operator = typeof candidate.operator === "string" ? candidate.operator.trim() : "";

    if (!field) throw new FilterValidationError(`${context} contains a filter without a field.`);
    if (!isKnownField(field)) {
      throw new FilterValidationError(`"${field}" is not a filterable field.`);
    }
    if (!OPERATORS.has(operator)) {
      throw new FilterValidationError(`"${operator}" is not a supported filter operator.`);
    }

    if (OPERATORS_WITHOUT_VALUE.has(operator)) {
      filters.push({ field, operator: operator as PropertyFilter["operator"] });
      continue;
    }

    const value = normalizeFilterValue(candidate.value, field);
    if (value === null) {
      throw new FilterValidationError(`The filter on "${field}" needs a value.`);
    }

    filters.push({ field, operator: operator as PropertyFilter["operator"], value });
  }

  return filters;
}

export class FilterValidationError extends Error {}

const MAX_FILTER_VALUE_LENGTH = 500;
const MAX_FILTER_LIST_LENGTH = 50;

function normalizeFilterValue(value: unknown, field: string): PropertyFilter["value"] | null {
  if (Array.isArray(value)) {
    if (value.length === 0 || value.length > MAX_FILTER_LIST_LENGTH) {
      throw new FilterValidationError(
        `The filter on "${field}" must list between 1 and ${MAX_FILTER_LIST_LENGTH} values.`
      );
    }
    return value.map((entry) => {
      const single = normalizeScalar(entry, field);
      if (single === null) throw new FilterValidationError(`The filter on "${field}" has an unusable value.`);
      return single;
    });
  }
  return normalizeScalar(value, field);
}

function normalizeScalar(value: unknown, field: string): string | number | boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.length > MAX_FILTER_VALUE_LENGTH) {
      throw new FilterValidationError(`The filter on "${field}" has a value that is too long.`);
    }
    return trimmed;
  }
  return null;
}

/**
 * The subset of the global filters that can be pushed into Mongo.
 *
 * Only exact matches on top-level string columns are translated. This is
 * a pure optimisation — every filter is still evaluated in
 * `matchesFilters` afterwards — so a filter that cannot be translated
 * costs a bigger scan, never a wrong answer.
 */
export function globalFilterMatch(filters: PropertyFilter[]): Record<string, unknown> {
  const match: Record<string, unknown> = {};

  for (const filter of filters) {
    if (filter.field.startsWith("properties.")) continue;
    if (!(FILTERABLE_FIELDS as readonly string[]).includes(filter.field)) continue;

    if (filter.operator === "equals" && typeof filter.value === "string") {
      // Only when nothing has claimed this field yet; two conflicting
      // equals filters would otherwise silently overwrite each other.
      if (!(filter.field in match)) match[filter.field] = filter.value;
    } else if (filter.operator === "in" && Array.isArray(filter.value)) {
      const values = filter.value.filter((entry): entry is string => typeof entry === "string");
      if (values.length > 0 && !(filter.field in match)) match[filter.field] = { $in: values };
    }
  }

  return match;
}

/** A short, readable description of a filter, for logs and the UI. */
export function describeFilter(filter: PropertyFilter): string {
  const labels: Record<string, string> = {
    equals: "is",
    not_equals: "is not",
    contains: "contains",
    not_contains: "does not contain",
    in: "is one of",
    is_set: "is set",
    is_not_set: "is not set",
  };
  const operator = labels[filter.operator] ?? filter.operator;
  if (OPERATORS_WITHOUT_VALUE.has(filter.operator)) return `${filter.field} ${operator}`;
  const value = Array.isArray(filter.value) ? filter.value.join(", ") : String(filter.value ?? "");
  return `${filter.field} ${operator} ${value}`;
}
