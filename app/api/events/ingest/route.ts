// ============================================================
// Aletsch AI — Legacy ingest endpoint
// ------------------------------------------------------------
// POST /api/events/ingest
//
// Superseded by POST /api/ingest, which is what the generated tracker
// calls. This path is kept so anything already pointing at it keeps
// working, but it no longer accepts unauthenticated writes: it used to
// take any event for any project from any caller, which let anyone
// forge another user's analytics.
//
// It now delegates to the real handler, so authorisation, rate
// limiting, sanitisation and session stitching are applied identically
// and cannot drift apart.
// ============================================================

import { POST as ingest, OPTIONS as ingestOptions } from "@/app/api/ingest/route";

export async function POST(req: Request) {
  return ingest(req);
}

export async function OPTIONS() {
  return ingestOptions();
}
