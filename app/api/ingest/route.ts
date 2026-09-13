// ============================================================
// Aletsch AI — Public telemetry ingest
// ------------------------------------------------------------
// POST /api/ingest
//
// This is the only endpoint called from outside Aletsch: browsers
// running the developer's instrumented application. It therefore has no
// Clerk session to rely on and is authorised by the project's
// publishable write key instead.
//
// What the write key grants: appending events to exactly one project.
// It cannot read events, cannot see the project, cannot touch GitHub,
// and cannot be used anywhere else in the API. That is why it is safe
// in a client bundle.
// ============================================================

import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { timingSafeEqual } from "node:crypto";
import { getDbOrNull } from "@/lib/mongodb";
import { fallbackStore } from "@/lib/fallback-store";
import { normalizeIngestPayload, type RawIngestPayload } from "@/lib/analytics/ingest";
import { consume } from "@/lib/security/rate-limit";

/** Per project+session: generous enough for real use, bounded enough to matter. */
const RATE_LIMIT = 240;
const RATE_WINDOW_MS = 60_000;
/** Largest body accepted, before parsing. */
const MAX_BODY_BYTES = 32 * 1024;

/**
 * The instrumented app is on a different origin, so the browser will
 * preflight. Events are append-only and the key is publishable, so any
 * origin may post — but credentials are never accepted, which keeps
 * this from being usable as a CSRF vector against a signed-in session.
 */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Aletsch-Write-Key",
  "Access-Control-Max-Age": "86400",
};

function cors(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: { ...CORS_HEADERS, ...(init.headers ?? {}) },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Constant-time comparison, so a wrong key leaks nothing by timing. */
function keysMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  try {
    // ── 1. Bound the body before parsing it ──────────────────
    const declaredLength = Number(req.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return cors({ error: "Payload too large." }, { status: 413 });
    }

    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return cors({ error: "Payload too large." }, { status: 413 });
    }

    let raw: RawIngestPayload;
    try {
      raw = JSON.parse(text);
    } catch {
      return cors({ error: "Body must be valid JSON." }, { status: 400 });
    }

    // ── 2. Normalise and sanitise ────────────────────────────
    const normalized = normalizeIngestPayload(raw);
    if (!normalized.ok) {
      return cors({ error: normalized.error }, { status: 400 });
    }
    const event = normalized.event;

    const providedKey =
      req.headers.get("x-aletsch-write-key")?.trim() ||
      (typeof raw.writeKey === "string" ? raw.writeKey.trim() : "");

    // ── 3. Rate limit before doing any database work ─────────
    // Keyed on project + session so one misbehaving tab cannot exhaust
    // the budget for every other visitor to the same app.
    const limit = consume(
      `ingest:${event.projectId}:${event.sessionId}`,
      RATE_LIMIT,
      RATE_WINDOW_MS
    );
    if (!limit.allowed) {
      return cors(
        { error: "Rate limit exceeded." },
        {
          status: 429,
          headers: {
            "Retry-After": String(limit.retryAfterSeconds),
            "X-RateLimit-Limit": String(limit.limit),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const db = await getDbOrNull();

    // ── 4. No-database mode ──────────────────────────────────
    if (!db) {
      const project = fallbackStore.getProjectById(event.projectId);
      if (!project) {
        return cors({ error: "Unknown project." }, { status: 404 });
      }
      if (project.writeKey && !keysMatch(providedKey, project.writeKey)) {
        return cors({ error: "Invalid write key." }, { status: 401 });
      }
      fallbackStore.addEvent({
        ownerId: project.ownerId,
        projectId: event.projectId,
        eventName: event.eventName,
        category: event.category,
        path: event.path,
        userId: event.distinctId,
        sessionId: event.sessionId,
        timestamp: event.timestamp,
        occurrences: 1,
      });
      return cors({
        success: true,
        storage: "in-memory",
        note: "No MONGODB_URI is configured, so this event is held in memory and will be lost on restart.",
        redactedKeys: event.redactedKeys,
      });
    }

    // ── 5. Authorise against the project's write key ─────────
    let project: any = null;
    try {
      project = await db.collection("projects").findOne({ _id: new ObjectId(event.projectId) });
    } catch {
      project = await db.collection("projects").findOne({ _id: event.projectId as any });
    }

    if (!project) {
      return cors({ error: "Unknown project." }, { status: 404 });
    }

    // A project with no key predates key enforcement. Reject rather
    // than silently accepting unauthenticated writes: the developer
    // needs to regenerate a key, and a quiet accept would hide that.
    if (!project.writeKey) {
      return cors(
        {
          error:
            "This project has no write key. Open the project in Aletsch and generate one, then set ALETSCH_WRITE_KEY in your app.",
        },
        { status: 401 }
      );
    }

    if (!providedKey || !keysMatch(providedKey, project.writeKey)) {
      return cors({ error: "Invalid write key." }, { status: 401 });
    }

    // ── 6. Persist ───────────────────────────────────────────
    const receivedAt = new Date().toISOString();

    await db.collection("events").insertOne({
      projectId: event.projectId,
      eventName: event.eventName,
      category: event.category,
      path: event.path,
      referrer: event.referrer,
      // `userId` is the tracked end user of the developer's app — an
      // opaque distinct id, not an Aletsch account.
      userId: event.distinctId,
      sessionId: event.sessionId,
      properties: event.properties,
      timestamp: event.timestamp,
      occurrences: 1,
      firstSeen: event.timestamp,
      lastSeen: event.timestamp,
      receivedAt,
    });

    // ── 7. Session stitching ─────────────────────────────────
    const sessionFilter = { sessionId: event.sessionId, projectId: event.projectId };
    await db.collection("sessions").updateOne(
      sessionFilter,
      {
        $set: { lastActivityAt: event.timestamp, exitPath: event.path },
        $inc: { eventCount: 1 },
        $setOnInsert: {
          sessionId: event.sessionId,
          projectId: event.projectId,
          userId: event.distinctId,
          startedAt: event.timestamp,
          entryPath: event.path,
          referrer: event.referrer,
          createdAt: receivedAt,
        },
      },
      { upsert: true }
    );

    return cors({
      success: true,
      // Reported back so a developer notices they are passing something
      // they should not, rather than it vanishing silently.
      redactedKeys: event.redactedKeys,
      remaining: limit.remaining,
    });
  } catch (error: any) {
    console.error("[Ingest] Failed to record event:", error?.message || error);
    // Never echo internals to a public endpoint.
    return cors({ error: "Could not record event." }, { status: 500 });
  }
}
