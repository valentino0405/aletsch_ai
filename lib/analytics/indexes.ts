// ============================================================
// Aletsch AI — Analytics indexes
// ------------------------------------------------------------
// The analytics queries all start with `projectId` and then narrow by
// time, by user, or by event name. These three compound indexes cover
// those shapes. Without them every funnel run is a collection scan.
//
// Index creation is idempotent in MongoDB — an existing index with the
// same keys and name is a no-op — so this is safe to call on every
// request. The process-level cache keeps it from costing a round trip
// each time.
// ============================================================

import type { Db } from "mongodb";

interface IndexSpec {
  collection: string;
  keys: Record<string, 1 | -1>;
  name: string;
}

/**
 * Why each index exists:
 *
 * - `project_timestamp`  — range scans for trends, stickiness and the
 *   event feed: match one project, walk a date window newest-first.
 * - `project_user_time`  — the funnel loader's access pattern. It also
 *   lets Mongo return each user's events already in chronological order,
 *   so the sequential engine never sorts in memory.
 * - `project_event_time` — the step picker and per-event lookups.
 */
const EVENT_INDEXES: IndexSpec[] = [
  { collection: "events", keys: { projectId: 1, timestamp: -1 }, name: "project_timestamp" },
  { collection: "events", keys: { projectId: 1, userId: 1, timestamp: 1 }, name: "project_user_time" },
  { collection: "events", keys: { projectId: 1, eventName: 1, timestamp: -1 }, name: "project_event_time" },
  { collection: "sessions", keys: { projectId: 1, startedAt: -1 }, name: "project_session_start" },
  { collection: "sessions", keys: { projectId: 1, userId: 1 }, name: "project_session_user" },
];

let ensured: Promise<void> | null = null;

/**
 * Create the analytics indexes once per process.
 *
 * Failures are logged and swallowed: a missing index makes queries slow,
 * but refusing to serve analytics because an index could not be created
 * would be a worse outcome for the caller. Deployments with a read-only
 * or restricted database user fall into this path by design.
 */
export function ensureAnalyticsIndexes(db: Db): Promise<void> {
  if (!ensured) {
    ensured = createIndexes(db).catch((error) => {
      console.warn("[ANALYTICS] index creation skipped:", (error as Error)?.message || error);
    });
  }
  return ensured;
}

async function createIndexes(db: Db): Promise<void> {
  await Promise.all(
    EVENT_INDEXES.map(async (spec) => {
      try {
        await db.collection(spec.collection).createIndex(spec.keys, {
          name: spec.name,
          background: true,
        });
      } catch (error) {
        // One index failing must not prevent the others from being created.
        console.warn(
          `[ANALYTICS] could not create ${spec.collection}.${spec.name}:`,
          (error as Error)?.message || error
        );
      }
    })
  );
}

/** Test seam: forget that indexes were ensured for this process. */
export function resetAnalyticsIndexCache(): void {
  ensured = null;
}

/** The index definitions, for documentation and verification scripts. */
export function describeAnalyticsIndexes(): IndexSpec[] {
  return EVENT_INDEXES.map((spec) => ({ ...spec, keys: { ...spec.keys } }));
}
