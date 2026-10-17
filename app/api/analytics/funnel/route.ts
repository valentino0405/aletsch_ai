// ============================================================
// Aletsch AI — Funnel analysis API
// ------------------------------------------------------------
// POST /api/analytics/funnel   run a funnel definition
// GET  /api/analytics/funnel   the same, from a shareable query string
//
// Authorisation comes first and comes from the server. The caller names a
// projectId; `resolveProjectScope` decides whether that name resolves to
// anything the caller owns, and only the ids it returns ever reach a
// query. A caller editing the projectId in a request gets a 404, not
// somebody else's funnel.
//
// Every number in the response is computed by lib/analytics/funnel-engine
// from events in the database. Nothing here consults an AI model, and
// there is no code path that fabricates a metric when data is missing —
// an empty project reports that it is empty.
// ============================================================

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDbOrNull } from "@/lib/mongodb";
import { resolveProjectScope } from "@/lib/analytics/scope";
import { runFunnelAnalysis } from "@/lib/analytics/funnel-runner";
import {
  FunnelRequestError,
  parseFunnelRequest,
  parseFunnelSearchParams,
} from "@/lib/analytics/funnel-request";
import type { FunnelQuery } from "@/lib/analytics/types";

/** Why a run produced no result at all, as opposed to a result of zero. */
type Unavailable = { state: "no_database" | "no_projects"; reason: string };

function unavailable(payload: Unavailable) {
  return NextResponse.json({ ok: true, project: null, result: null, unavailable: payload });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const projectId = readProjectId(body);

  let query: FunnelQuery;
  try {
    query = parseFunnelRequest(body);
  } catch (error) {
    if (error instanceof FunnelRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  return run(query, projectId, readName(body));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  let query: FunnelQuery;
  try {
    query = parseFunnelSearchParams(searchParams);
  } catch (error) {
    if (error instanceof FunnelRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  return run(query, searchParams.get("projectId"), searchParams.get("name"));
}

/**
 * Authorise, execute, and translate failures into something a developer
 * can act on.
 *
 * Internal errors are logged server-side and answered with a single
 * sentence: a stack trace in an API response tells an attacker about the
 * stack and tells the developer nothing they can use.
 */
async function run(query: FunnelQuery, projectId: string | null, name: string | null) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getDbOrNull();
    if (!db) {
      return unavailable({
        state: "no_database",
        reason:
          "No database is configured, so no events have been collected. Set MONGODB_URI and instrument a repository to build a funnel.",
      });
    }

    const scope = await resolveProjectScope(db, userId, projectId);
    if (!scope.ok) {
      return NextResponse.json({ error: scope.error }, { status: scope.status });
    }
    if (!scope.scope) {
      return unavailable({ state: "no_projects", reason: scope.reason });
    }

    const result = await runFunnelAnalysis(db, scope.scope.projectIds, query, {
      name: name?.trim() || undefined,
      source: name?.trim() ? "saved" : "custom",
    });

    return NextResponse.json({
      ok: true,
      project: scope.scope.project,
      result,
    });
  } catch (error: any) {
    console.error("[FUNNEL] run failed:", error?.message || error);
    return NextResponse.json(
      { error: "The funnel could not be calculated. The error has been logged." },
      { status: 500 }
    );
  }
}

function readProjectId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as Record<string, unknown>).projectId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readName(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as Record<string, unknown>).name;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
