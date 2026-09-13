// ============================================================
// Manual verification of the ingest authorisation path.
//
// Seeds a throwaway project with a known write key, then exercises
// POST /api/ingest over HTTP to confirm that a correct key is accepted,
// a wrong key is refused, and sensitive properties are stripped before
// anything reaches the database. Cleans up after itself.
//
// Run: npx tsx scripts/verify-ingest.ts
// ============================================================

import { MongoClient, ObjectId } from "mongodb";
import { readFileSync } from "node:fs";

// Minimal .env reader so this script has no new dependency.
function loadEnv() {
  try {
    for (const line of readFileSync(".env", "utf8").split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // No .env — rely on the ambient environment.
  }
}

const BASE = process.env.VERIFY_BASE_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  loadEnv();

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set; cannot run this verification.");
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "aletsch");

  const projectId = new ObjectId();
  const writeKey = `alt_pk_verify_${Date.now()}`;

  await db.collection("projects").insertOne({
    _id: projectId,
    ownerId: "verify-script-owner",
    name: "__verify_ingest__",
    repositoryUrl: "https://github.com/example/verify",
    writeKey,
    createdAt: new Date().toISOString(),
  });

  const id = projectId.toString();
  console.log(`\nSeeded throwaway project ${id}\n`);

  try {
    // 1. Correct key is accepted.
    const good = await fetch(`${BASE}/api/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Aletsch-Write-Key": writeKey },
      body: JSON.stringify({
        projectId: id,
        event: "verify_event",
        sessionId: "verify-session",
        path: "/checkout?token=SHOULD_BE_STRIPPED",
        properties: { label: "Buy now", password: "hunter2", note: "ghp_" + "x".repeat(36) },
      }),
    });
    const goodBody: any = await good.json().catch(() => ({}));
    check("a valid write key is accepted", good.status === 200, `got ${good.status} ${JSON.stringify(goodBody)}`);

    // 2. Wrong key on a real project is refused.
    const bad = await fetch(`${BASE}/api/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Aletsch-Write-Key": "alt_pk_wrong_key_entirely" },
      body: JSON.stringify({ projectId: id, event: "forged_event" }),
    });
    check("an invalid write key is refused", bad.status === 401 || bad.status === 403, `got ${bad.status}`);

    // 3. Missing key on a real project is refused.
    const none = await fetch(`${BASE}/api/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: id, event: "keyless_event" }),
    });
    check("a missing write key is refused", none.status === 401 || none.status === 403, `got ${none.status}`);

    // 4. What actually landed in the database.
    const stored = await db.collection("events").findOne({ projectId: id, eventName: "verify_event" });
    check("the accepted event was persisted", !!stored);

    if (stored) {
      const props = (stored.properties ?? {}) as Record<string, unknown>;
      check("the password property was stripped", !("password" in props), JSON.stringify(props));
      check("the token-shaped value was stripped", !("note" in props), JSON.stringify(props));
      check("the benign property survived", props.label === "Buy now", JSON.stringify(props));
      check(
        "the query string was removed from the path",
        typeof stored.path === "string" && !stored.path.includes("token"),
        String(stored.path)
      );
    }

    const forged = await db.collection("events").countDocuments({
      projectId: id,
      eventName: { $in: ["forged_event", "keyless_event"] },
    });
    check("no unauthorised event was written", forged === 0, `found ${forged}`);
  } finally {
    // Clean up regardless of outcome.
    await db.collection("events").deleteMany({ projectId: id });
    await db.collection("sessions").deleteMany({ projectId: id });
    await db.collection("projects").deleteOne({ _id: projectId });
    await client.close();
    console.log("\nCleaned up throwaway project and its events.");
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
