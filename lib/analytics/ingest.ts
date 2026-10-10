// ============================================================
// Aletsch AI — Event ingest normalisation
// ------------------------------------------------------------
// The ingest endpoint is the one public, unauthenticated-by-Clerk
// surface in the system: it is called by a browser running someone
// else's application. Everything arriving here is untrusted.
//
// This module is pure so the rules can be tested directly. It does
// three jobs:
//
//   1. Validates the payload shape and rejects what it cannot trust.
//   2. Strips anything that looks like a credential or personal data
//      before it is persisted — a well-meaning developer will pass a
//      whole form object to track() sooner or later.
//   3. Bounds the payload, so one caller cannot write unbounded
//      documents into the events collection.
// ============================================================

import { normalizeDeclaredContext, normalizeSource, type EventContext, type EventSource } from "./enrichment";

/** Payload the generated tracker sends (see tracker-template.ts). */
export interface RawIngestPayload {
  projectId?: unknown;
  writeKey?: unknown;
  event?: unknown;
  /** Accepted as an alias so the older /api/events/ingest shape works. */
  eventName?: unknown;
  distinctId?: unknown;
  userId?: unknown;
  anonymousId?: unknown;
  sessionId?: unknown;
  timestamp?: unknown;
  path?: unknown;
  referrer?: unknown;
  category?: unknown;
  properties?: unknown;
  /**
   * Optional device/browser/os/country declared by the caller. The
   * generated tracker does not send this; the route derives the same
   * fields from request headers and those take precedence. Present so
   * server-to-server and synthetic callers can supply what a header
   * cannot tell us. See lib/analytics/enrichment.ts.
   */
  context?: unknown;
  /** Optional "web" | "server" | "synthetic". Defaults to "web". */
  source?: unknown;
}

export interface NormalizedEvent {
  projectId: string;
  eventName: string;
  category: string;
  path: string;
  referrer: string;
  distinctId: string;
  sessionId: string;
  timestamp: string;
  properties: Record<string, string | number | boolean>;
  /** Property keys dropped as sensitive, reported back so the developer can fix the call site. */
  redactedKeys: string[];
  /** Caller-declared context, already normalised. Fields may be absent. */
  declaredContext: EventContext;
  /** Marks generated demo traffic so it can be labelled and excluded. */
  source: EventSource;
}

export type NormalizeResult =
  | { ok: true; event: NormalizedEvent }
  | { ok: false; error: string };

export const MAX_EVENT_NAME_LENGTH = 120;
export const MAX_PROPERTY_COUNT = 40;
export const MAX_PROPERTY_VALUE_LENGTH = 500;
export const MAX_PATH_LENGTH = 500;
/** Timestamps further than this from now are replaced with server time. */
export const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

/**
 * Property keys that must never be persisted.
 *
 * Matched case-insensitively as substrings, because the names that show
 * up in practice are compounds: `userPassword`, `stripe_secret_key`,
 * `authToken`. Over-matching here costs a dropped property; under-matching
 * costs a credential in the database.
 */
const SENSITIVE_KEY_PATTERNS = [
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "api_key",
  "accesskey",
  "access_key",
  "privatekey",
  "private_key",
  "credential",
  "authorization",
  "auth_header",
  "bearer",
  "session_secret",
  "cookie",
  "ssn",
  "creditcard",
  "credit_card",
  "cardnumber",
  "card_number",
  "cvv",
  "cvc",
  "pin",
  "otp",
  "mfa",
  "signature",
  "client_secret",
  "refresh_token",
];

/** Values that look like a credential regardless of their key. */
const SENSITIVE_VALUE_PATTERNS = [
  /^gh[pousr]_[A-Za-z0-9]{16,}$/, // GitHub tokens
  /^github_pat_[A-Za-z0-9_]{20,}$/,
  /^sk-[A-Za-z0-9-_]{16,}$/, // OpenAI-style
  /^sk_live_[A-Za-z0-9]{16,}$/, // Stripe
  /^xox[baprs]-[A-Za-z0-9-]{10,}$/, // Slack
  /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, // JWT
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

export function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[\s-]/g, "_");
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function looksLikeCredential(value: string): boolean {
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Event names are constrained to the character set the generated
 * catalog produces, so a hostile name cannot break aggregation
 * pipelines or be mistaken for an operator.
 */
export function normalizeEventName(raw: string): string {
  return raw
    .trim()
    .replace(/[^A-Za-z0-9_.:-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[_.:-]+|[_.:-]+$/g, "")
    .slice(0, MAX_EVENT_NAME_LENGTH);
}

/**
 * Keeps only the path. Query strings and fragments routinely carry
 * reset tokens, email addresses and invite codes; none of that belongs
 * in an analytics store.
 */
export function normalizePath(raw: string): string {
  if (!raw) return "/";
  let path = raw;

  // Tolerate a full URL being passed instead of a path.
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      path = "/";
    }
  }

  path = path.split("?")[0].split("#")[0];
  if (!path.startsWith("/")) path = `/${path}`;
  return path.slice(0, MAX_PATH_LENGTH) || "/";
}

/** Origin only — a referrer's path and query can be as sensitive as our own. */
export function normalizeReferrer(raw: string): string {
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

/**
 * Flattens and filters properties.
 *
 * Only scalars survive: nested objects and arrays are where whole form
 * payloads and API responses get passed in by accident.
 */
export function sanitizeProperties(raw: unknown): {
  properties: Record<string, string | number | boolean>;
  redactedKeys: string[];
} {
  const properties: Record<string, string | number | boolean> = {};
  const redactedKeys: string[] = [];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { properties, redactedKeys };
  }

  let kept = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (kept >= MAX_PROPERTY_COUNT) break;

    const safeKey = key.trim().slice(0, 80);
    if (!safeKey) continue;

    if (isSensitiveKey(safeKey)) {
      redactedKeys.push(safeKey);
      continue;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) continue;
      properties[safeKey] = value;
      kept += 1;
      continue;
    }

    if (typeof value === "boolean") {
      properties[safeKey] = value;
      kept += 1;
      continue;
    }

    if (typeof value === "string") {
      if (looksLikeCredential(value)) {
        redactedKeys.push(safeKey);
        continue;
      }
      properties[safeKey] = value.slice(0, MAX_PROPERTY_VALUE_LENGTH);
      kept += 1;
      continue;
    }

    // null, undefined, objects, arrays and functions are dropped.
  }

  return { properties, redactedKeys };
}

/** Clamps a client clock to something believable. */
export function normalizeTimestamp(raw: unknown, now = Date.now()): string {
  const parsed = typeof raw === "string" || typeof raw === "number" ? new Date(raw).getTime() : NaN;
  if (!Number.isFinite(parsed) || Math.abs(now - parsed) > MAX_CLOCK_SKEW_MS) {
    return new Date(now).toISOString();
  }
  return new Date(parsed).toISOString();
}

/** Categorises an event when the caller did not. */
function inferCategory(eventName: string, explicit: string): string {
  if (explicit) return explicit.slice(0, 40);
  if (/(^|_)(page_?view|viewed|screen)($|_)/i.test(eventName)) return "Pageview";
  if (/(submit|submitted|form)/i.test(eventName)) return "Form";
  if (/(signup|sign_up|login|logout|auth|register)/i.test(eventName)) return "Conversion";
  return "Interaction";
}

/**
 * Validates and normalises one incoming event.
 *
 * The write key is deliberately *not* checked here — that requires a
 * database lookup and belongs in the route. This function only decides
 * whether the payload is well-formed and safe to store.
 */
export function normalizeIngestPayload(raw: RawIngestPayload, now = Date.now()): NormalizeResult {
  const projectId = asString(raw.projectId).trim();
  if (!projectId) return { ok: false, error: "projectId is required." };
  if (projectId.length > 64) return { ok: false, error: "projectId is not a valid identifier." };

  const rawEventName = asString(raw.event) || asString(raw.eventName);
  if (!rawEventName.trim()) return { ok: false, error: "An event name is required." };

  const eventName = normalizeEventName(rawEventName);
  if (!eventName) return { ok: false, error: "The event name contained no usable characters." };

  const distinctId =
    asString(raw.distinctId).trim() ||
    asString(raw.userId).trim() ||
    asString(raw.anonymousId).trim() ||
    "anonymous";

  const { properties, redactedKeys } = sanitizeProperties(raw.properties);

  return {
    ok: true,
    event: {
      projectId,
      eventName,
      category: inferCategory(eventName, asString(raw.category).trim()),
      path: normalizePath(asString(raw.path)),
      referrer: normalizeReferrer(asString(raw.referrer)),
      distinctId: distinctId.slice(0, 200),
      sessionId: (asString(raw.sessionId).trim() || "session_unknown").slice(0, 200),
      timestamp: normalizeTimestamp(raw.timestamp, now),
      properties,
      redactedKeys,
      declaredContext: normalizeDeclaredContext(raw.context),
      source: normalizeSource(raw.source),
    },
  };
}
