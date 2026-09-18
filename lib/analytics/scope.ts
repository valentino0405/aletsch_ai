// ============================================================
// Aletsch AI — Project scope and authorization
// ------------------------------------------------------------
// Every analytics request answers three questions before it reads a
// single event:
//
//   1. Is the caller authenticated?
//   2. Does the requested project exist?
//   3. Does the caller own it?
//
// A projectId from a client is a request, never a grant. The only ids
// that reach a query are ones this module resolved from the caller's own
// `projects` documents, so a caller cannot read another owner's funnel by
// editing a URL.
// ============================================================

import { ObjectId } from "mongodb";
import type { Db } from "mongodb";

export interface ProjectScope {
  /** Project ids, as strings, that queries may read. Never empty on success. */
  projectIds: string[];
  /** The single project when one was requested by id. */
  project: { id: string; name: string } | null;
}

export type ScopeResult =
  | { ok: true; scope: ProjectScope }
  | { ok: false; status: 401 | 403 | 404; error: string }
  | { ok: true; scope: null; empty: true; reason: string };

/**
 * Resolve which projects a caller may read.
 *
 * With no `projectIdParam`, the scope is every project the caller owns.
 * With one, the project must exist *and* be owned by the caller; both
 * failures answer 404 so the endpoint does not confirm the existence of
 * projects belonging to someone else.
 */
export async function resolveProjectScope(
  db: Db,
  userId: string | null | undefined,
  projectIdParam?: string | null
): Promise<ScopeResult> {
  if (!userId) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  if (projectIdParam) {
    const project = await findOwnedProject(db, userId, projectIdParam);
    if (!project) {
      return { ok: false, status: 404, error: "Project not found or unauthorized." };
    }
    return {
      ok: true,
      scope: {
        projectIds: [project._id.toString()],
        project: { id: project._id.toString(), name: String(project.name ?? "Untitled project") },
      },
    };
  }

  const owned = await db
    .collection("projects")
    .find({ ownerId: userId }, { projection: { _id: 1, name: 1 } })
    .toArray();

  if (owned.length === 0) {
    return {
      ok: true,
      scope: null,
      empty: true,
      reason: "No projects connected yet. Connect a repository to start collecting events.",
    };
  }

  return {
    ok: true,
    scope: {
      projectIds: owned.map((project) => project._id.toString()),
      project:
        owned.length === 1
          ? { id: owned[0]._id.toString(), name: String(owned[0].name ?? "Untitled project") }
          : null,
    },
  };
}

/**
 * Look up one project the caller owns.
 *
 * Ids are stored as ObjectIds, but a malformed id from a client must not
 * throw out of the route — an unparseable id is simply not found.
 */
export async function findOwnedProject(
  db: Db,
  userId: string,
  projectId: string
): Promise<Record<string, any> | null> {
  const ownership = { ownerId: userId };

  if (ObjectId.isValid(projectId)) {
    const byObjectId = await db
      .collection("projects")
      .findOne({ _id: new ObjectId(projectId), ...ownership });
    if (byObjectId) return byObjectId;
  }

  // Tolerate installations where ids were stored as plain strings.
  return db.collection("projects").findOne({ _id: projectId as any, ...ownership });
}

/** The `$in` clause every analytics query starts from. */
export function projectMatch(projectIds: string[]): { projectId: { $in: string[] } } {
  return { projectId: { $in: projectIds } };
}
