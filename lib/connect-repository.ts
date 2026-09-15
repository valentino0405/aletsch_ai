// ============================================================
// Aletsch AI — Repository connect pipeline
// ------------------------------------------------------------
// The single path by which a repository becomes a connected project.
//
// This module exists because "Projects" and "Repositories" used to be
// two different features that both claimed to connect a repo: one wrote
// a bare document with no GitHub metadata and never analyzed anything,
// while the other ran the full pipeline. A project created from the
// wrong page looked connected and silently produced no events.
//
// There is now exactly one implementation, and both API routes call it,
// so the two pages are two views of the same record rather than two
// half-built features.
// ============================================================

import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import {
  parseGitHubUrl,
  getRepoMetadata,
  getRepoBranches,
  getRepoFileTree,
  type GitHubAuth,
  type GitHubRepoMeta,
} from "@/lib/github";
import { resolveGitHubAuth } from "@/lib/github-connection";
import { generateProjectWriteKey } from "@/lib/security/token-crypto";
import { fallbackStore } from "@/lib/fallback-store";

export interface ConnectResult {
  projectId: string;
  name: string;
  repositoryUrl: string;
  branch: string;
  language: string;
  isPrivate: boolean;
  meta: GitHubRepoMeta;
  branches: string[];
  /** True when this URL was already connected and has now been re-synced. */
  reconnected: boolean;
  analysisStarted: boolean;
  message: string;
}

export class ConnectError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Source-file extensions worth indexing for analysis. */
function isAnalyzableFile(path: string, type: string): boolean {
  if (type !== "blob") return false;
  const ignored = ["node_modules/", ".git/", ".next/", "dist/", "build/", "coverage/", "vendor/"];
  if (ignored.some((segment) => path.includes(segment))) return false;

  const isSource = /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte)$/.test(path);
  const isConfig = /^(package\.json|tsconfig\.json|next\.config\.(js|ts|mjs))$/.test(path);
  return isSource || isConfig;
}

/**
 * Connects a GitHub repository for a user.
 *
 * Resolves the caller's own GitHub credential first so private
 * repositories work when the user has connected GitHub, and re-uses an
 * existing project's write key so that re-connecting a repo never breaks
 * trackers already deployed against it.
 */
export async function connectRepository(options: {
  db: Db | null;
  userId: string;
  repositoryUrl: string;
  /** Overrides the repo's default branch when the user picked one. */
  branch?: string;
  /** Overrides the repo name as the project's display name. */
  name?: string;
}): Promise<ConnectResult> {
  const { db, userId } = options;

  let parsed: { owner: string; repo: string };
  try {
    parsed = parseGitHubUrl(options.repositoryUrl);
  } catch (error: any) {
    throw new ConnectError(error?.message || "That does not look like a GitHub repository URL.", 400);
  }

  // Canonical form, so the same repo entered three different ways
  // (with .git, with a trailing slash, via SSH) is one project.
  const repositoryUrl = `https://github.com/${parsed.owner}/${parsed.repo}`;

  const auth: GitHubAuth = await resolveGitHubAuth(userId);

  let meta: GitHubRepoMeta;
  try {
    meta = await getRepoMetadata(parsed.owner, parsed.repo, auth);
  } catch (error: any) {
    const status = error?.status;
    if (status === 404) {
      throw new ConnectError(
        auth.source === "user_oauth"
          ? `${parsed.owner}/${parsed.repo} was not found. Check the name, or confirm your GitHub account can see it.`
          : `${parsed.owner}/${parsed.repo} was not found. If it is private, connect your GitHub account first.`,
        404
      );
    }
    if (status === 403) {
      throw new ConnectError("GitHub refused the request (rate limit or insufficient scope).", 403);
    }
    throw new ConnectError(`Could not reach GitHub: ${error?.message || "unknown error"}`, 400);
  }

  let branches: string[] = [meta.defaultBranch];
  try {
    branches = await getRepoBranches(parsed.owner, parsed.repo, auth);
  } catch {
    // Non-fatal: the default branch alone is enough to proceed.
  }

  // Only honour a requested branch that actually exists.
  const requested = options.branch?.trim();
  const branch = requested && branches.includes(requested) ? requested : meta.defaultBranch || "main";
  const name = options.name?.trim() || meta.name;

  if (!db) {
    return connectInFallback({ userId, repositoryUrl, branch, name, meta, branches });
  }

  const existing = await db.collection("projects").findOne({ repositoryUrl, ownerId: userId });

  // `$set` rather than `replaceOne`: a re-connect must not discard the
  // write key, the creation date, or anything a later feature adds.
  const now = new Date().toISOString();
  await db.collection("projects").updateOne(
    { repositoryUrl, ownerId: userId },
    {
      $set: {
        name,
        repositoryUrl,
        branch,
        language: meta.language,
        isPrivate: meta.isPrivate,
        defaultBranch: meta.defaultBranch,
        status: "Analyzing",
        updatedAt: now,
      },
      $setOnInsert: {
        ownerId: userId,
        writeKey: generateProjectWriteKey(),
        createdAt: now,
      },
    },
    { upsert: true }
  );

  const project = await db.collection("projects").findOne({ repositoryUrl, ownerId: userId });
  if (!project?._id) {
    throw new ConnectError("The project could not be saved.", 500);
  }
  const projectId = project._id.toString();

  // The repositories collection is the GitHub-side mirror of the same
  // connection, keyed by the project it belongs to so the two views
  // cannot drift apart.
  await db.collection("repositories").updateOne(
    { url: repositoryUrl, ownerId: userId },
    {
      $set: {
        ownerId: userId,
        projectId,
        url: repositoryUrl,
        owner: meta.owner,
        name: meta.name,
        fullName: meta.fullName,
        defaultBranch: meta.defaultBranch,
        branch,
        description: meta.description,
        stars: meta.stars,
        forks: meta.forks,
        language: meta.language,
        isPrivate: meta.isPrivate,
        branches,
        status: "Analyzing",
        lastSyncedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  const analysisStarted = await startAnalysis({
    db,
    projectId,
    owner: parsed.owner,
    repo: parsed.repo,
    branch,
    defaultBranch: meta.defaultBranch,
    auth,
  });

  return {
    projectId,
    name,
    repositoryUrl,
    branch,
    language: meta.language,
    isPrivate: meta.isPrivate,
    meta,
    branches,
    reconnected: Boolean(existing),
    analysisStarted,
    message: analysisStarted
      ? `${meta.fullName} connected. Analysis of the ${branch} branch has started.`
      : `${meta.fullName} connected, but the file listing could not be read, so analysis did not start.`,
  };
}

/**
 * Indexes the repo's source files and kicks off background analysis.
 * Returns false when the tree could not be read — the caller reports
 * that honestly rather than claiming an analysis is running.
 */
async function startAnalysis(options: {
  db: Db;
  projectId: string;
  owner: string;
  repo: string;
  branch: string;
  defaultBranch: string;
  auth: GitHubAuth;
}): Promise<boolean> {
  const { db, projectId } = options;

  let files;
  try {
    files = await getRepoFileTree(options.owner, options.repo, options.branch, options.auth);
  } catch (error: unknown) {
    // A branch that has been renamed since it was listed 404s exactly like
    // a missing repository. Retry on the default branch before giving up.
    const status = (error as { status?: number })?.status;
    const canRetryOnDefault =
      status === 404 && options.defaultBranch && options.branch !== options.defaultBranch;

    if (!canRetryOnDefault) {
      console.error("[connect] Could not read the repository file tree:", error);
      await markProjectStatus(db, projectId, "Error");
      return false;
    }

    try {
      files = await getRepoFileTree(options.owner, options.repo, options.defaultBranch, options.auth);
    } catch (retryError) {
      console.error("[connect] Could not read the repository file tree:", retryError);
      await markProjectStatus(db, projectId, "Error");
      return false;
    }
  }

  const relevant = files.filter((file) => isAnalyzableFile(file.path, file.type));

  await db.collection("sourceFiles").deleteMany({ projectId });
  if (relevant.length > 0) {
    await db.collection("sourceFiles").insertMany(
      relevant.map((file) => ({
        projectId,
        path: file.path,
        githubUrl: file.url,
        size: file.size ?? null,
        syncedAt: new Date().toISOString(),
      }))
    );
  }

  const job = await db.collection("analysisJobs").insertOne({
    projectId,
    status: "queued",
    progress: 0,
    currentStep: `Indexed ${relevant.length} source file${relevant.length === 1 ? "" : "s"}. Starting AST scan...`,
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });

  const jobId = job.insertedId.toString();
  // Detached deliberately: the HTTP response should not wait for a full
  // repository analysis. Failures are recorded on the job document.
  void (async () => {
    try {
      const { runBackgroundAnalysis } = await import("@/lib/analysis-runner");
      await runBackgroundAnalysis(projectId, jobId);
    } catch (error) {
      console.error("[connect] Background analysis failed:", error);
      await db
        .collection("analysisJobs")
        .updateOne(
          { _id: job.insertedId },
          { $set: { status: "failed", currentStep: "Analysis failed. See server logs.", finishedAt: new Date().toISOString() } }
        )
        .catch(() => undefined);
      await markProjectStatus(db, projectId, "Error");
    }
  })();

  return true;
}

/**
 * Sets a project's status by id, tolerating both ObjectId and string
 * `_id` shapes. Never throws: this runs on failure paths where losing
 * the status update must not mask the original error.
 */
async function markProjectStatus(db: Db, projectId: string, status: string): Promise<void> {
  const update = { $set: { status, updatedAt: new Date().toISOString() } };
  try {
    const result = await db.collection("projects").updateOne({ _id: new ObjectId(projectId) }, update);
    if (result.matchedCount > 0) return;
  } catch {
    // Not a valid ObjectId — fall through to the string form.
  }
  await db
    .collection("projects")
    .updateOne({ _id: projectId as any }, update)
    .catch(() => undefined);
}

/** In-memory equivalent for when MongoDB is not configured. */
function connectInFallback(options: {
  userId: string;
  repositoryUrl: string;
  branch: string;
  name: string;
  meta: GitHubRepoMeta;
  branches: string[];
}): ConnectResult {
  const { userId, repositoryUrl, branch, name, meta, branches } = options;

  const existing = fallbackStore.getProjects(userId).find((p) => p.repositoryUrl === repositoryUrl);
  const id = existing?.id ?? "fb_" + Math.random().toString(36).substring(2, 11);
  const now = new Date().toISOString();

  fallbackStore.saveRepository({
    id,
    ownerId: userId,
    url: repositoryUrl,
    owner: meta.owner,
    name: meta.name,
    defaultBranch: meta.defaultBranch,
    stars: meta.stars,
    forks: meta.forks,
    language: meta.language,
    branches,
    lastSyncedAt: now,
    status: "Analyzing",
  });

  fallbackStore.saveProject({
    id,
    ownerId: userId,
    name,
    repositoryUrl,
    branch,
    language: meta.language,
    status: "Analyzing",
    events: 0,
    lastAnalyzed: now,
    writeKey: existing?.writeKey || generateProjectWriteKey(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });

  const jobId = "fb_job_" + Math.random().toString(36).substring(2, 10);
  fallbackStore.saveAnalysisJob({
    id: jobId,
    projectId: id,
    status: "queued",
    progress: 0,
    currentStep: "Starting repository analysis...",
    createdAt: now,
  });

  void (async () => {
    try {
      const { runFallbackAnalysis } = await import("@/lib/analysis-runner");
      // The owner id is what lets the runner resolve this user's own OAuth
      // token; without it a private repository 404s in fallback mode.
      await runFallbackAnalysis(id, jobId, repositoryUrl, branch, userId);
    } catch (error) {
      console.error("[connect] Fallback analysis failed:", error);
    }
  })();

  return {
    projectId: id,
    name,
    repositoryUrl,
    branch,
    language: meta.language,
    isPrivate: meta.isPrivate,
    meta,
    branches,
    reconnected: Boolean(existing),
    analysisStarted: true,
    message: `${meta.fullName} connected. Analysis of the ${branch} branch has started.`,
  };
}
