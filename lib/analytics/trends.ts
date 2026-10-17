// ============================================================
// Aletsch AI — Trend series
// ------------------------------------------------------------
// Daily counts and week-over-week deltas, computed from the raw
// `events` collection (one document per event, see /api/events/ingest).
//
// Every series returned here is measured. When a project has no events
// the series is all zeros and `hasData` is false, so the UI can draw a
// flat line labelled "no data" instead of an invented trend.
// ============================================================

import type { Db } from "mongodb";

export interface TrendPoint {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  events: number;
  users: number;
}

export interface TrendDelta {
  /** Signed percentage change against the previous window, null when the previous window was empty. */
  percent: number | null;
  direction: "up" | "down" | "flat";
  /** Ready-to-render label: "+18.3%", "-4.0%", or "No prior data". */
  label: string;
}

export interface TrendSummary {
  series: TrendPoint[];
  eventSparkline: number[];
  userSparkline: number[];
  events: TrendDelta;
  users: TrendDelta;
  hasData: boolean;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function delta(current: number, previous: number): TrendDelta {
  if (previous === 0) {
    if (current === 0) return { percent: null, direction: "flat", label: "No prior data" };
    return { percent: null, direction: "up", label: "New activity" };
  }
  const percent = Math.round(((current - previous) / previous) * 1000) / 10;
  const direction = percent > 0 ? "up" : percent < 0 ? "down" : "flat";
  return {
    percent,
    direction,
    label: `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`,
  };
}

/**
 * Daily event/user counts for the last `days` days, plus the change
 * against the equally-long window before it.
 */
export async function computeTrends(
  db: Db,
  projectIds: string[],
  days = 7
): Promise<TrendSummary> {
  const emptyDelta: TrendDelta = { percent: null, direction: "flat", label: "No prior data" };

  const buildEmpty = (): TrendSummary => {
    const series: TrendPoint[] = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const day = new Date();
      day.setUTCDate(day.getUTCDate() - offset);
      series.push({ date: isoDate(day), events: 0, users: 0 });
    }
    return {
      series,
      eventSparkline: series.map(() => 0),
      userSparkline: series.map(() => 0),
      events: emptyDelta,
      users: emptyDelta,
      hasData: false,
    };
  };

  if (projectIds.length === 0) return buildEmpty();

  const windowStart = new Date();
  windowStart.setUTCDate(windowStart.getUTCDate() - (days - 1));
  windowStart.setUTCHours(0, 0, 0, 0);

  const previousStart = new Date(windowStart);
  previousStart.setUTCDate(previousStart.getUTCDate() - days);

  // `timestamp` is stored as an ISO string, so a string comparison is a
  // correct chronological one and stays index-friendly.
  const rows = await db
    .collection("events")
    .aggregate([
      {
        $match: {
          projectId: { $in: projectIds },
          timestamp: { $gte: previousStart.toISOString() },
        },
      },
      {
        $group: {
          _id: { $substrBytes: ["$timestamp", 0, 10] },
          events: { $sum: { $ifNull: ["$occurrences", 1] } },
          users: { $addToSet: "$userId" },
        },
      },
      { $project: { events: 1, users: { $size: "$users" } } },
    ])
    .toArray();

  const byDate = new Map<string, { events: number; users: number }>(
    rows.map((row) => [row._id as string, { events: row.events as number, users: row.users as number }])
  );

  const series: TrendPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date();
    day.setUTCDate(day.getUTCDate() - offset);
    const key = isoDate(day);
    const found = byDate.get(key);
    series.push({ date: key, events: found?.events ?? 0, users: found?.users ?? 0 });
  }

  const currentKeys = new Set(series.map((point) => point.date));
  let previousEvents = 0;
  let previousUsers = 0;
  for (const [date, value] of byDate) {
    if (currentKeys.has(date)) continue;
    previousEvents += value.events;
    previousUsers += value.users;
  }

  const currentEvents = series.reduce((total, point) => total + point.events, 0);
  // Unique users across the whole window, not a sum of per-day uniques.
  const currentUserIds = await db.collection("events").distinct("userId", {
    projectId: { $in: projectIds },
    timestamp: { $gte: windowStart.toISOString() },
  });
  const previousUserIds = await db.collection("events").distinct("userId", {
    projectId: { $in: projectIds },
    timestamp: { $gte: previousStart.toISOString(), $lt: windowStart.toISOString() },
  });

  return {
    series,
    eventSparkline: series.map((point) => point.events),
    userSparkline: series.map((point) => point.users),
    events: delta(currentEvents, previousEvents),
    users: delta(currentUserIds.length, previousUserIds.length),
    hasData: currentEvents > 0 || previousEvents > 0,
  };
}
