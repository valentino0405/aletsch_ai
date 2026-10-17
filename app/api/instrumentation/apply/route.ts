// ============================================================
// Aletsch AI — Apply instrumentation
// ------------------------------------------------------------
// POST /api/instrumentation/apply
//
// Turns an approved event catalog into a real pull request: a branch is
// created off the repository's tracked branch, the generated tracker
// modules and the AST-rewritten source files are committed to that
// branch, and a PR is opened for review.
//
// The default branch is never written to. `createBranch` starts from the
// head of the base branch and every write targets the *new* branch, so
// the repository's own history is untouched until a human merges. That
// promise is made in the Settings UI, so this route deliberately has no
// fallback that commits directly.
//
// The change set is recomputed here from the repository rather than read
// back from storage: Aletsch never persists a copy of private source.
// ============================================================

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ObjectId } from "mongodb";
import { randomBytes } from "node:crypto";
import { getDbOrNull } from "@/lib/mongodb";
import {
  branchExists,
  commitFile,
  createBranch,
  createPullRequest,
  getBranchHeadSha,
  getFileSha,
  getRawFileContent,
  getRepoFileTree,
  getRepoMetadata,
  parseGitHubUrl,
  type GitHubAuth,
} from "@/lib/github";
import { resolveGitHubAuth } from "@/lib/github-connection";
import { detectFramework } from "@/lib/ingestion/framework-detector";
import { classifyInteractions } from "@/lib/ai/intent-classifier";
import { buildEventCatalog } from "@/lib/events/event-plan";
import type { DetectedInteraction, InteractionType, DetectionMethod } from "@/lib/ast/types";
import { buildChangeSet, renderPullRequestBody } from "@/lib/instrumentation/change-set";
import { consume } from "@/lib/security/rate-limit";

/** Opening a branch and a PR is expensive and outward-facing: keep it rare. */
const APPLY_LIMIT = 5;
const APPLY_WINDOW_MS = 60_000;
/** Files whose contents feed framework detection. */
const MANIFEST_NAMES = [
  "package.json",
  "tsconfig.json",
  "jsconfig.json",
  "next.config.js",
  "next.config.ts",
  "next.config.mjs",
  "vite.config.ts",
  "vite.config.js",
  "svelte.config.js",
  "astro.config.mjs",
  "nuxt.config.ts",
  "angular.json",
];
const MANIFEST_SKIP = ["node_modules/", "dist/", "build/", ".next/", ".git/"];

interface ProjectDoc {
  _id: unknown;
  ownerId?: string;
  name?: string;
  repositoryUrl?: string;
  branch?: string;
  defaultBranch?: string;
  writeKey?: string;
}

/** A stored interaction row, shaped back into what the catalog expects. */
function toInteraction(doc: Record<string, unknown>): DetectedInteraction | null {
  const filePath = typeof doc.filePath === "string" ? doc.filePath : null;
  const lineNumber = typeof doc.lineNumber === "number" ? doc.lineNumber : null;
  if (!filePath || lineNumber === null) return null;

  return {
    type: (doc.type as InteractionType) ?? "unknown",
    label: typeof doc.label === "string" ? doc.label : "",
    eventName: typeof doc.eventName === "string" ? doc.eventName : "",
    handler: typeof doc.handler === "string" ? doc.handler : "",
    componentName: typeof doc.componentName === "string" ? doc.componentName : "",
    filePath,
    route: typeof doc.route === "string" ? doc.route : "",
    lineNumber,
    confidence: typeof doc.confidence === "number" ? doc.confidence : 0,
    detectionMethod: (doc.detectionMethod as DetectionMethod) ?? "jsx_button_handler",
    metadata: (doc.metadata as Record<string, unknown> | undefined) ?? {},
  };
}

/** GitHub's own wording is fine; our framing is better. */
function githubMessage(error: unknown, fallback: string): string {
  const message = (error as Error)?.message;
  return typeof message === "string" && message.length > 0 ? message : fallback;
}

/** A git-ref-safe slug, so branch names stay readable and portable. */
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "project"
  );
}

/**
 * The commit message a developer will read in their own history.
 *
 * Imperative and specific: `file.purpose` is reviewer-facing prose that
 * reads badly as a subject line, so the message is derived from what the
 * commit actually did to that file.
 */
function commitMessage(file: { path: string; isNew: boolean; applied: { length: number } }): string {
  if (file.applied.length > 0) {
    const count = file.applied.length;
    return `Instrument ${count} analytics event${count === 1 ? "" : "s"} in ${file.path}`;
  }
  if (file.isNew) return `Add Aletsch analytics runtime (${file.path})`;
  return `Wire up Aletsch analytics in ${file.path}`;
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    if (!projectId) {
      return NextResponse.json({ error: "A projectId is required." }, { status: 400 });
    }

    // ── 1. Throttle before anything touches GitHub ────────────
    const limit = consume(`instrumentation-apply:${userId}`, APPLY_LIMIT, APPLY_WINDOW_MS);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: `Too many apply requests. Try again in ${limit.retryAfterSeconds}s.` },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    const db = await getDbOrNull();
    if (!db) {
      // Applying needs the project record, the write key and the detected
      // interactions. Without a database none of those exist, and opening
      // a PR against a guessed repository would be worse than failing.
      return NextResponse.json(
        { error: "Database unavailable. Please configure MONGODB_URI." },
        { status: 503 }
      );
    }

    // ── 2. Verify project ownership ───────────────────────────
    let project: ProjectDoc | null = null;
    try {
      project = (await db
        .collection("projects")
        .findOne({ _id: new ObjectId(projectId), ownerId: userId })) as unknown as ProjectDoc | null;
    } catch {
      // Not a valid ObjectId — fall through to the string form.
    }
    if (!project) {
      project = (await db
        .collection("projects")
        .findOne({ _id: projectId as never, ownerId: userId })) as unknown as ProjectDoc | null;
    }
    if (!project) {
      return NextResponse.json({ error: "Project not found or unauthorized." }, { status: 404 });
    }
    if (!project.repositoryUrl) {
      return NextResponse.json(
        { error: "This project has no repository URL, so there is nothing to commit to." },
        { status: 400 }
      );
    }

    const resolvedProjectId = String(project._id);
    const projectName = project.name || resolvedProjectId;

    // ── 3. Resolve the credential and the repository ──────────
    const githubAuth: GitHubAuth = await resolveGitHubAuth(userId);
    if (!githubAuth.token || githubAuth.source === "none") {
      return NextResponse.json(
        {
          error:
            "No GitHub credential is available. Connect your GitHub account from Settings — applying instrumentation writes to the repository and needs write access.",
        },
        { status: 403 }
      );
    }

    const { owner, repo } = parseGitHubUrl(project.repositoryUrl);

    let meta;
    try {
      meta = await getRepoMetadata(owner, repo, githubAuth);
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status;
      return NextResponse.json(
        {
          error:
            status === 404
              ? `${owner}/${repo} is not visible to the current GitHub credential.`
              : `Repository lookup failed: ${githubMessage(error, "GitHub could not be reached.")}`,
        },
        { status: status === 404 ? 404 : 400 }
      );
    }

    // A read-only credential fails at the first commit, after a branch has
    // already been created. Check the permission up front instead.
    if (!meta.permissions?.push) {
      const hint =
        githubAuth.source === "user_oauth"
          ? "Your GitHub authorisation does not include write access to this repository. Re-authorise from Settings, and if it belongs to an organisation an owner must approve the Aletsch OAuth app."
          : "Aletsch is using the server credential, which can only read public repositories. Connect your GitHub account from Settings to apply changes.";
      return NextResponse.json({ error: `Cannot write to ${owner}/${repo}. ${hint}` }, { status: 403 });
    }

    // ── 4. Read the file tree ─────────────────────────────────
    // Branch off the branch being tracked, and open the PR against that
    // same branch, so the diff is exactly what the developer reviews.
    let baseBranch: string = project.branch || meta.defaultBranch || "main";
    let tree;
    try {
      tree = await getRepoFileTree(owner, repo, baseBranch, githubAuth);
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status;
      const canRetry = status === 404 && meta.defaultBranch && baseBranch !== meta.defaultBranch;
      if (!canRetry) {
        return NextResponse.json(
          {
            error:
              status === 404
                ? `Branch "${baseBranch}" does not exist in ${owner}/${repo}. Sync the repository first.`
                : `Could not read the repository: ${githubMessage(error, "the file tree was unavailable.")}`,
          },
          { status: 400 }
        );
      }
      try {
        tree = await getRepoFileTree(owner, repo, meta.defaultBranch, githubAuth);
        baseBranch = meta.defaultBranch;
      } catch (retryError: unknown) {
        return NextResponse.json(
          {
            error: `Could not read the default branch "${meta.defaultBranch}": ${githubMessage(retryError, "the file tree was unavailable.")}`,
          },
          { status: 400 }
        );
      }
    }

    const repoFilePaths = tree.filter((file) => file.type === "blob").map((file) => file.path);
    if (repoFilePaths.length === 0) {
      return NextResponse.json(
        { error: `${owner}/${repo} has no files on "${baseBranch}", so there is nothing to instrument.` },
        { status: 400 }
      );
    }

    // ── 5. Detect the framework from the manifests ────────────
    // One cached reader backs both detection and the change set, so a
    // file needed twice is only fetched once.
    const fileCache = new Map<string, string | null>();
    const readFile = async (path: string): Promise<string | null> => {
      const cached = fileCache.get(path);
      if (cached !== undefined) return cached;
      let content: string | null = null;
      try {
        content = await getRawFileContent(owner, repo, baseBranch, path, githubAuth);
      } catch (error: unknown) {
        // A missing file is an expected answer, not a failure.
        if ((error as { status?: number })?.status !== 404) throw error;
      }
      fileCache.set(path, content);
      return content;
    };

    const manifestPaths = repoFilePaths
      .filter((path) => !MANIFEST_SKIP.some((skip) => path.includes(skip)))
      .filter((path) => MANIFEST_NAMES.includes(path.split("/").pop() ?? path))
      .slice(0, 12);

    const manifests: Record<string, string> = {};
    for (const path of manifestPaths) {
      const content = await readFile(path);
      if (content !== null) manifests[path] = content;
    }

    const framework = detectFramework({ filePaths: repoFilePaths, manifests });

    // ── 6. Rebuild the catalog from the stored interactions ───
    const interactionDocs = await db
      .collection("detectedInteractions")
      .find({ projectId: resolvedProjectId })
      .sort({ confidence: -1 })
      .limit(300)
      .toArray();

    const interactions = interactionDocs
      .map((doc) => toInteraction(doc as unknown as Record<string, unknown>))
      .filter((interaction): interaction is DetectedInteraction => interaction !== null);

    if (interactions.length === 0) {
      return NextResponse.json(
        {
          error:
            "No detected interactions for this project. Run an analysis first — instrumentation is only generated for interactions Aletsch has actually seen in the source.",
        },
        { status: 400 }
      );
    }

    const classification = await classifyInteractions(interactions, {
      frameworkLabel: framework.label,
      batchSize: 12,
      maxInteractions: 60,
    });

    const catalog = buildEventCatalog(interactions, classification.intents, {
      llmAvailable: classification.llmAvailable,
      llmError: classification.llmError,
    });

    // ── 7. Decide which events to instrument ──────────────────
    const requestedNames: unknown = body.eventNames;
    const requested = Array.isArray(requestedNames)
      ? requestedNames.filter((name: unknown): name is string => typeof name === "string")
      : null;

    const available = new Set(catalog.events.map((event) => event.eventName));
    const approvedEventNames = requested
      ? requested.filter((name) => available.has(name))
      : catalog.events.filter((event) => event.selectedByDefault).map((event) => event.eventName);

    if (approvedEventNames.length === 0) {
      return NextResponse.json(
        {
          error: requested
            ? "None of the requested events are in this project's catalog. Nothing was applied."
            : "No events are selected for instrumentation, so there is nothing to apply.",
          available: Array.from(available),
        },
        { status: 400 }
      );
    }

    // ── 8. Build the change set ───────────────────────────────
    const ingestOrigin =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") || new URL(req.url).origin;

    const changeSet = await buildChangeSet({
      framework,
      catalog,
      approvedEventNames,
      projectId: resolvedProjectId,
      ingestOrigin,
      includePostHog: body.includePostHog === true,
      writeKey: project.writeKey ?? null,
      readFile,
      repoFilePaths,
    });

    // A change set with any validation error must never be applied — the
    // invariant is documented on buildChangeSet, and this is the only
    // place in the app that can act on it.
    if (!changeSet.validation.valid) {
      const offenders = changeSet.validation.files
        .filter((file) => !file.valid)
        .map((file) => ({
          path: file.filePath,
          issues: file.issues
            .filter((issue) => issue.severity === "error")
            .map((issue) => issue.message),
        }));
      return NextResponse.json(
        {
          error: `Generated code failed validation in ${offenders.length} file${offenders.length === 1 ? "" : "s"}, so nothing was committed.`,
          files: offenders,
        },
        { status: 422 }
      );
    }

    if (changeSet.isEmpty) {
      return NextResponse.json({
        success: false,
        applied: false,
        message: `${owner}/${repo} is already instrumented for the selected events — every generated file matches what is on "${baseBranch}". Nothing was committed.`,
        summary: changeSet.summary,
      });
    }

    // ── 9. Branch, commit, open the PR ────────────────────────
    const headSha = await getBranchHeadSha(owner, repo, baseBranch, githubAuth);
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    let newBranch = `aletsch/analytics-${slugify(projectName)}-${stamp}-${randomBytes(3).toString("hex")}`;
    if (await branchExists(owner, repo, newBranch, githubAuth)) {
      // Astronomically unlikely, but a collision would make the first
      // commit fail with a confusing 422.
      newBranch = `${newBranch}-${randomBytes(2).toString("hex")}`;
    }

    try {
      await createBranch(owner, repo, newBranch, headSha, githubAuth);
    } catch (error: unknown) {
      return NextResponse.json(
        {
          error: `Could not create the branch "${newBranch}": ${githubMessage(error, "GitHub rejected the request.")}`,
        },
        { status: 502 }
      );
    }

    const changedFiles = changeSet.files.filter((file) => !file.diff.unchanged);
    const committedPaths: string[] = [];

    for (const file of changedFiles) {
      try {
        // Content that already exists on the new branch needs its blob SHA;
        // an addition must omit it.
        // The new branch was cut from the base head, so a file that already
        // exists there has the same blob SHA on both refs.
        const existingSha = file.isNew
          ? null
          : await getFileSha(owner, repo, file.path, newBranch, githubAuth);
        await commitFile(
          owner,
          repo,
          {
            path: file.path,
            content: file.content,
            message: commitMessage(file),
            branch: newBranch,
            sha: existingSha,
          },
          githubAuth
        );
        committedPaths.push(file.path);
      } catch (error: unknown) {
        // Leaving a half-written branch behind would be worse than an
        // honest failure: say which file failed and what landed.
        return NextResponse.json(
          {
            error: `Failed to commit ${file.path}: ${githubMessage(error, "GitHub rejected the commit.")}`,
            branch: newBranch,
            committed: committedPaths,
            message: `The branch "${newBranch}" was created and ${committedPaths.length} of ${changedFiles.length} file${changedFiles.length === 1 ? "" : "s"} were committed before this failure. No pull request was opened.`,
          },
          { status: 502 }
        );
      }
    }

    let pullRequest;
    try {
      pullRequest = await createPullRequest(
        owner,
        repo,
        {
          title: `Add Aletsch analytics instrumentation (${approvedEventNames.length} event${approvedEventNames.length === 1 ? "" : "s"})`,
          body: renderPullRequestBody(changeSet, catalog, projectName),
          head: newBranch,
          base: baseBranch,
        },
        githubAuth
      );
    } catch (error: unknown) {
      return NextResponse.json(
        {
          error: `The commits landed on "${newBranch}" but the pull request could not be opened: ${githubMessage(error, "GitHub rejected the request.")}`,
          branch: newBranch,
          committed: committedPaths,
        },
        { status: 502 }
      );
    }

    // ── 10. Record the plan so coverage reflects reality ──────
    // Only files that actually emit events carry a `events` array; the
    // instrumentation API treats an applied plan with events as live
    // coverage and ignores the rest.
    const planFiles = changeSet.files
      .filter((file) => file.applied.length > 0)
      .map((file) => ({
        path: file.path,
        events: Array.from(new Set(file.applied.map((edit) => edit.eventName))),
      }));

    const planDoc = {
      projectId: resolvedProjectId,
      status: "applied",
      repository: `${owner}/${repo}`,
      branch: newBranch,
      baseBranch,
      pullRequest: {
        number: pullRequest.number,
        url: pullRequest.url,
        state: pullRequest.state,
      },
      files: planFiles,
      approvedEventNames,
      summary: changeSet.summary,
      validation: {
        errorCount: changeSet.validation.errorCount,
        warningCount: changeSet.validation.warningCount,
      },
      catalog: {
        events: catalog.events.length,
        llmClassified: classification.llmClassified,
        ruleClassified: classification.ruleClassified,
      },
      warnings: changeSet.warnings,
      framework: framework.framework,
      appliedBy: userId,
      createdAt: new Date().toISOString(),
    };

    let planId: string | null = null;
    try {
      const inserted = await db.collection("instrumentationPlans").insertOne(planDoc);
      planId = inserted.insertedId.toString();
    } catch (error: unknown) {
      // The PR exists and is the source of truth; failing the whole request
      // over a bookkeeping write would misreport a successful apply.
      console.error("[instrumentation/apply] Could not record the plan:", error);
    }

    await db
      .collection("projects")
      .updateOne({ _id: project._id as never }, { $set: { updatedAt: new Date().toISOString() } })
      .catch(() => undefined);

    return NextResponse.json({
      success: true,
      applied: true,
      planId,
      projectId: resolvedProjectId,
      repository: `${owner}/${repo}`,
      branch: newBranch,
      baseBranch,
      pullRequest: {
        number: pullRequest.number,
        url: pullRequest.url,
        state: pullRequest.state,
      },
      summary: changeSet.summary,
      events: approvedEventNames,
      files: planFiles,
      warnings: changeSet.warnings,
      message: `${changeSet.summary.eventsInstrumented} event call site${changeSet.summary.eventsInstrumented === 1 ? "" : "s"} committed across ${committedPaths.length} file${committedPaths.length === 1 ? "" : "s"} on "${newBranch}". "${baseBranch}" was not touched.`,
    });
  } catch (error: unknown) {
    console.error("[instrumentation/apply] Error:", error);
    return NextResponse.json(
      { error: (error as Error)?.message || "Server Error" },
      { status: 500 }
    );
  }
}
