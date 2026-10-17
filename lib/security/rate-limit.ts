// ============================================================
// Aletsch AI — In-process rate limiter
// ------------------------------------------------------------
// A fixed-window counter guarding the public ingest endpoint.
//
// This is deliberately in-memory: it holds per-instance, resets on
// deploy, and does not coordinate across replicas. That is honest for
// a single-instance deployment and enough to stop a runaway client or
// a casual flood. A multi-replica deployment needs Redis — see
// `isDistributed` below, which tells callers what they are actually
// getting rather than implying a guarantee that is not there.
// ============================================================

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Stops the map growing without bound under many distinct keys. */
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  /** Unix ms when the current window ends. */
  resetAt: number;
  /** Seconds until the window ends, for a Retry-After header. */
  retryAfterSeconds: number;
}

/** False — this limiter is per-process only. Callers should not claim otherwise. */
export const isDistributed = false;

function sweep(now: number) {
  if (windows.size < MAX_TRACKED_KEYS) return;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
  // Still full of live windows: drop the oldest to bound memory.
  if (windows.size >= MAX_TRACKED_KEYS) {
    const oldest = [...windows.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (const [key] of oldest.slice(0, Math.floor(MAX_TRACKED_KEYS / 4))) {
      windows.delete(key);
    }
  }
}

/**
 * Consumes one unit against `key`.
 *
 * @param limit    Requests permitted per window.
 * @param windowMs Window length in milliseconds.
 */
export function consume(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): RateLimitResult {
  sweep(now);

  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    windows.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: limit - 1,
      limit,
      resetAt,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;

  return {
    allowed,
    remaining: Math.max(0, limit - existing.count),
    limit,
    resetAt: existing.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

/** Test helper: forgets all windows. */
export function resetRateLimiter() {
  windows.clear();
}
