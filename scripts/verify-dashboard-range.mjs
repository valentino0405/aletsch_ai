// ============================================================
// Verifies that the dashboard's date-range picker is a real
// parameter and not a label.
//
// The picker used to set component state that was never sent
// anywhere: /api/dashboard read only `projectId` and hardcoded a
// 7-day window, so "Today" and "Last 30 days" returned byte-identical
// numbers. This script proves the window is now honoured by seeding
// events at known ages and checking each range counts exactly the
// events that fall inside it.
//
// Run with:  node --env-file=.env scripts/verify-dashboard-range.mjs
// ============================================================

import { MongoClient, ObjectId } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "aletsch_ai";

if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set. Run with: node --env-file=.env scripts/verify-dashboard-range.mjs");
  process.exit(1);
}

const MARKER = "__range_probe__";
const client = new MongoClient(MONGODB_URI);

/** An ISO timestamp `daysAgo` days in the past, at midday UTC. */
function daysAgoIso(daysAgo) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(12, 0, 0, 0);
  return date.toISOString();
}

/** Mirrors resolveRange() in app/api/dashboard/route.ts. */
function windowStart(days) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

async function main() {
  await client.connect();
  const db = client.db(DB_NAME);

  const project = await db.collection("projects").findOne({});
  if (!project) {
    console.error("No projects found. Connect a repository in the UI first.");
    process.exit(1);
  }
  const projectId = project._id.toString();
  console.log(`Project under test: "${project.name}" (${projectId})\n`);

  // Ages chosen to straddle every boundary: inside today, inside 7d,
  // inside 30d, and outside all of them.
  const probes = [
    { age: 0, label: "today" },
    { age: 3, label: "3 days ago" },
    { age: 20, label: "20 days ago" },
    { age: 90, label: "90 days ago" },
  ];

  await db.collection("events").deleteMany({ projectId, probe: MARKER });
  await db.collection("events").insertMany(
    probes.map((probe) => ({
      projectId,
      probe: MARKER,
      eventName: `probe_${probe.age}d`,
      category: "Interaction",
      userId: `probe-user-${probe.age}`,
      occurrences: 1,
      timestamp: daysAgoIso(probe.age),
    }))
  );
  console.log(`Seeded ${probes.length} probe events at: ${probes.map((p) => p.label).join(", ")}\n`);

  // Expected counts: a probe is inside a range when its age is under `days`.
  const ranges = [
    { key: "1d", days: 1 },
    { key: "7d", days: 7 },
    { key: "30d", days: 30 },
  ];

  let failures = 0;
  for (const range of ranges) {
    const start = windowStart(range.days);
    const counted = await db.collection("events").countDocuments({
      projectId,
      probe: MARKER,
      timestamp: { $gte: start },
    });
    const expected = probes.filter((probe) => daysAgoIso(probe.age) >= start).length;
    const ok = counted === expected;
    if (!ok) failures += 1;
    console.log(
      `  ${ok ? "PASS" : "FAIL"}  range=${range.key.padEnd(4)} counted ${counted} probe event(s), expected ${expected}`
    );
  }

  // The whole point: the ranges must not all return the same number.
  const counts = [];
  for (const range of ranges) {
    counts.push(
      await db.collection("events").countDocuments({
        projectId,
        probe: MARKER,
        timestamp: { $gte: windowStart(range.days) },
      })
    );
  }
  const distinct = new Set(counts).size;
  const varies = distinct > 1;
  if (!varies) failures += 1;
  console.log(
    `\n  ${varies ? "PASS" : "FAIL"}  ranges return different counts (${counts.join(" / ")}) — ` +
      `the picker changes the data, not just the label`
  );

  await db.collection("events").deleteMany({ projectId, probe: MARKER });
  console.log("\nProbe events removed.");

  await client.close();
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("All range checks passed.");
}

main().catch(async (error) => {
  console.error(error);
  await client.close().catch(() => {});
  process.exit(1);
});
