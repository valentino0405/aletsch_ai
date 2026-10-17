// ============================================================
// Aletsch AI — GitHub REST client
// ------------------------------------------------------------
// Every function accepts an optional `GitHubAuth` so calls can be
// made with the *signed-in user's* OAuth token. When none is
// supplied it falls back to the server-wide GITHUB_TOKEN, which only
// ever grants public-repository access.
//
// Security invariants enforced here:
//   • tokens are never returned in a response body
//   • tokens are never interpolated into an error message
//   • tokens are never logged
// ============================================================

const API_ROOT = "https://api.github.com";
const USER_AGENT = "Aletsch-AI";

export interface GitHubAuth {
  /** OAuth access token or PAT. */
  token?: string;
  /** Identifies the credential source for diagnostics — never the value. */
  source?: "user_oauth" | "server_pat" | "none";
}

export interface GitHubRepoMeta {
  name: string;
  owner: string;
  fullName: string;
  defaultBranch: string;
  description: string;
  stars: number;
  forks: number;
  language: string;
  isPrivate: boolean;
  htmlUrl: string;
  pushedAt: string | null;
  /** Permissions the authenticated credential holds on this repo. */
  permissions: { admin: boolean; push: boolean; pull: boolean };
}

export interface GitHubFile {
  path: string;
  type: "blob" | "tree";
  url: string;
  size?: number;
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
}

export interface RateLimitSnapshot {
  remaining: number | null;
  limit: number | null;
  resetAt: string | null;
}

/** Error type that carries HTTP status without leaking credentials. */
export class GitHubApiError extends Error {
  readonly status: number;
  readonly endpoint: string;
  readonly rateLimit: RateLimitSnapshot;

  constructor(message: string, status: number, endpoint: string, rateLimit: RateLimitSnapshot) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.rateLimit = rateLimit;
  }
}

function resolveToken(auth?: GitHubAuth): string | undefined {
  if (auth?.token) return auth.token;
  return process.env.GITHUB_TOKEN || undefined;
}

function buildHeaders(auth: GitHubAuth | undefined, accept: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = resolveToken(auth);
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function readRateLimit(response: Response): RateLimitSnapshot {
  const remaining = response.headers.get("x-ratelimit-remaining");
  const limit = response.headers.get("x-ratelimit-limit");
  const reset = response.headers.get("x-ratelimit-reset");
  return {
    remaining: remaining === null ? null : Number(remaining),
    limit: limit === null ? null : Number(limit),
    resetAt: reset === null ? null : new Date(Number(reset) * 1000).toISOString(),
  };
}

/**
 * Converts a GitHub failure into a message that is safe to surface to
 * the developer and contains no credential material.
 */
function describeFailure(status: number, endpoint: string, authed: boolean, body: string): string {
  switch (status) {
    case 401:
      return "GitHub rejected the credential (401). Reconnect your GitHub account from Settings.";
    case 403:
      if (/rate limit/i.test(body)) {
        return authed
          ? "GitHub API rate limit reached for your account. Try again after the limit resets."
          : "GitHub API rate limit reached for unauthenticated requests. Connect your GitHub account to raise the limit.";
      }
      return "GitHub denied access (403). The OAuth grant may not include this repository or organisation.";
    case 404:
      return authed
        ? `GitHub returned 404 for ${endpoint}. The repository does not exist, or your GitHub authorisation does not include it.`
        : `GitHub returned 404 for ${endpoint}. If the repository is private, connect your GitHub account first.`;
    case 409:
      return "GitHub reported a conflict (409). The repository may be empty or the branch already changed.";
    case 422:
      return `GitHub rejected the request as unprocessable (422): ${body.slice(0, 200)}`;
    default:
      return `GitHub API error ${status} on ${endpoint}.`;
  }
}

interface RequestOptions {
  method?: string;
  accept?: string;
  body?: unknown;
  auth?: GitHubAuth;
  /** Set to return `null` instead of throwing on 404. */
  tolerate404?: boolean;
}

async function githubRequest(endpoint: string, options: RequestOptions = {}): Promise<Response | null> {
  const { method = "GET", accept = "application/vnd.github+json", body, auth, tolerate404 } = options;
  const url = endpoint.startsWith("http") ? endpoint : `${API_ROOT}${endpoint}`;

  const headers = buildHeaders(auth, accept);
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch (cause) {
    throw new GitHubApiError(
      `Could not reach the GitHub API (${endpoint}). Check network connectivity.`,
      0,
      endpoint,
      { remaining: null, limit: null, resetAt: null }
    );
  }

  if (response.ok) return response;
  if (response.status === 404 && tolerate404) return null;

  const text = await response.text().catch(() => "");
  throw new GitHubApiError(
    describeFailure(response.status, endpoint, Boolean(resolveToken(auth)), text),
    response.status,
    endpoint,
    readRateLimit(response)
  );
}

// ────────────────────────────────────────────────────────────
// URL parsing
// ────────────────────────────────────────────────────────────

/**
 * Extracts `{ owner, repo }` from any common GitHub URL form, or from a
 * bare `owner/repo` slug.
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } {
  if (typeof url !== "string" || url.trim() === "") {
    throw new Error("Repository URL is required.");
  }

  const cleaned = url
    .trim()
    .replace(/^git\+/, "")
    .replace(/^git@github\.com:/, "")
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
    .replace(/^\/+/, "");

  const parts = cleaned.split(/[/#?]/).filter(Boolean);
  if (parts.length < 2) {
    throw new Error("Invalid GitHub repository URL. Expected https://github.com/owner/repository.");
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
    throw new Error("Invalid GitHub repository URL: owner or repository name contains unsupported characters.");
  }

  return { owner, repo };
}

// ────────────────────────────────────────────────────────────
// Read operations
// ────────────────────────────────────────────────────────────

/** The account the supplied credential belongs to. */
export async function getAuthenticatedUser(auth?: GitHubAuth): Promise<GitHubUser> {
  const response = await githubRequest("/user", { auth });
  const data = await response!.json();
  return {
    login: data.login,
    name: data.name ?? null,
    avatarUrl: data.avatar_url ?? "",
    htmlUrl: data.html_url ?? "",
  };
}

function mapRepo(data: Record<string, any>): GitHubRepoMeta {
  return {
    name: data.name,
    owner: data.owner?.login ?? "",
    fullName: data.full_name ?? `${data.owner?.login}/${data.name}`,
    defaultBranch: data.default_branch || "main",
    description: data.description || "",
    stars: data.stargazers_count || 0,
    forks: data.forks_count || 0,
    language: data.language || "Unknown",
    isPrivate: Boolean(data.private),
    htmlUrl: data.html_url ?? "",
    pushedAt: data.pushed_at ?? null,
    permissions: {
      admin: Boolean(data.permissions?.admin),
      push: Boolean(data.permissions?.push),
      pull: data.permissions?.pull !== false,
    },
  };
}

export async function getRepoMetadata(
  owner: string,
  repo: string,
  auth?: GitHubAuth
): Promise<GitHubRepoMeta> {
  const response = await githubRequest(`/repos/${owner}/${repo}`, { auth });
  return mapRepo(await response!.json());
}

/**
 * Lists every repository the credential can see, public and private,
 * newest-push first. Paginates so large accounts are fully covered.
 */
export async function listUserRepositories(
  auth: GitHubAuth,
  options: { maxRepos?: number } = {}
): Promise<GitHubRepoMeta[]> {
  const maxRepos = options.maxRepos ?? 300;
  const perPage = 100;
  const repos: GitHubRepoMeta[] = [];

  for (let page = 1; repos.length < maxRepos; page++) {
    const response = await githubRequest(
      `/user/repos?per_page=${perPage}&page=${page}&sort=pushed&direction=desc&affiliation=owner,collaborator,organization_member`,
      { auth }
    );
    const batch = (await response!.json()) as Record<string, any>[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos.push(...batch.map(mapRepo));
    if (batch.length < perPage) break;
  }

  return repos.slice(0, maxRepos);
}

export async function getRepoBranches(
  owner: string,
  repo: string,
  auth?: GitHubAuth
): Promise<string[]> {
  const response = await githubRequest(`/repos/${owner}/${repo}/branches?per_page=100`, { auth });
  const data = await response!.json();
  return Array.isArray(data) ? data.map((b: any) => b.name) : [];
}

/** Recursive tree listing for one branch. */
export async function getRepoFileTree(
  owner: string,
  repo: string,
  branch: string,
  auth?: GitHubAuth
): Promise<GitHubFile[]> {
  const response = await githubRequest(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { auth }
  );
  const data = await response!.json();
  if (!Array.isArray(data?.tree)) return [];

  return data.tree.map((entry: any) => ({
    path: entry.path,
    type: entry.type === "tree" ? "tree" : "blob",
    url: entry.url,
    size: typeof entry.size === "number" ? entry.size : undefined,
  }));
}

/**
 * Downloads one file's text.
 *
 * Uses the authenticated Contents API rather than raw.githubusercontent.com
 * because the raw host does not accept bearer tokens for private
 * repositories — without this, private-repo analysis silently 404s.
 */
export async function getRawFileContent(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  auth?: GitHubAuth
): Promise<string> {
  const endpoint = `/repos/${owner}/${repo}/contents/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}?ref=${encodeURIComponent(branch)}`;

  const response = await githubRequest(endpoint, { auth, accept: "application/vnd.github.raw" });
  const text = await response!.text();

  // Files over 1 MB come back as JSON metadata instead of raw bytes.
  if (text.startsWith('{"') && /"content"\s*:/.test(text.slice(0, 400))) {
    try {
      const json = JSON.parse(text);
      if (json.encoding === "base64" && typeof json.content === "string") {
        return Buffer.from(json.content, "base64").toString("utf8");
      }
    } catch {
      /* fall through and return the body as-is */
    }
  }

  return text;
}

/** Returns the blob SHA of a file, or `null` when it does not exist. */
export async function getFileSha(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  auth?: GitHubAuth
): Promise<string | null> {
  const endpoint = `/repos/${owner}/${repo}/contents/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}?ref=${encodeURIComponent(ref)}`;
  const response = await githubRequest(endpoint, { auth, tolerate404: true });
  if (!response) return null;
  const data = await response.json();
  return typeof data?.sha === "string" ? data.sha : null;
}

// ────────────────────────────────────────────────────────────
// Write operations — branch, commit, pull request
// ────────────────────────────────────────────────────────────

/** Head commit SHA of a branch. */
export async function getBranchHeadSha(
  owner: string,
  repo: string,
  branch: string,
  auth?: GitHubAuth
): Promise<string> {
  const response = await githubRequest(
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    { auth }
  );
  const data = await response!.json();
  const sha = data?.object?.sha;
  if (typeof sha !== "string") {
    throw new GitHubApiError(`Branch "${branch}" has no resolvable head commit.`, 422, "git/ref", {
      remaining: null,
      limit: null,
      resetAt: null,
    });
  }
  return sha;
}

export async function branchExists(
  owner: string,
  repo: string,
  branch: string,
  auth?: GitHubAuth
): Promise<boolean> {
  const response = await githubRequest(
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    { auth, tolerate404: true }
  );
  return response !== null;
}

/**
 * Creates a new branch pointing at `fromSha`.
 *
 * Aletsch never commits to the repository's default branch; every
 * instrumentation apply runs through a freshly created branch.
 */
export async function createBranch(
  owner: string,
  repo: string,
  newBranch: string,
  fromSha: string,
  auth?: GitHubAuth
): Promise<void> {
  await githubRequest(`/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    auth,
    body: { ref: `refs/heads/${newBranch}`, sha: fromSha },
  });
}

export interface CommitFileResult {
  path: string;
  commitSha: string;
  contentSha: string;
}

/** Creates or updates one file on a branch. */
export async function commitFile(
  owner: string,
  repo: string,
  params: {
    path: string;
    content: string;
    message: string;
    branch: string;
    /** Existing blob SHA; required when the file already exists. */
    sha?: string | null;
  },
  auth?: GitHubAuth
): Promise<CommitFileResult> {
  const endpoint = `/repos/${owner}/${repo}/contents/${params.path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  const response = await githubRequest(endpoint, {
    method: "PUT",
    auth,
    body: {
      message: params.message,
      content: Buffer.from(params.content, "utf8").toString("base64"),
      branch: params.branch,
      ...(params.sha ? { sha: params.sha } : {}),
    },
  });

  const data = await response!.json();
  return {
    path: params.path,
    commitSha: data?.commit?.sha ?? "",
    contentSha: data?.content?.sha ?? "",
  };
}

export interface PullRequestResult {
  number: number;
  url: string;
  state: string;
  head: string;
  base: string;
}

export async function createPullRequest(
  owner: string,
  repo: string,
  params: { title: string; body: string; head: string; base: string; draft?: boolean },
  auth?: GitHubAuth
): Promise<PullRequestResult> {
  const response = await githubRequest(`/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    auth,
    body: {
      title: params.title,
      body: params.body,
      head: params.head,
      base: params.base,
      draft: params.draft ?? false,
    },
  });

  const data = await response!.json();
  return {
    number: data.number,
    url: data.html_url,
    state: data.state,
    head: data.head?.ref ?? params.head,
    base: data.base?.ref ?? params.base,
  };
}

/** Current rate-limit budget for the supplied credential. */
export async function getRateLimit(auth?: GitHubAuth): Promise<RateLimitSnapshot> {
  const response = await githubRequest("/rate_limit", { auth });
  const data = await response!.json();
  const core = data?.resources?.core ?? data?.rate ?? {};
  return {
    remaining: typeof core.remaining === "number" ? core.remaining : null,
    limit: typeof core.limit === "number" ? core.limit : null,
    resetAt: typeof core.reset === "number" ? new Date(core.reset * 1000).toISOString() : null,
  };
}
