// ============================================================
// Aletsch AI — GitHub account connection (OAuth)
// ------------------------------------------------------------
// Implements the GitHub OAuth Web Application Flow so a developer can
// authorise Aletsch to read their repositories — including private
// ones — without ever pasting a password or a raw token into a form.
//
// Token handling rules enforced here:
//   • the access token is exchanged server-side only
//   • it is sealed with AES-256-GCM before it touches storage
//   • it is never returned to the browser, logged, or sent to an LLM
// ============================================================

import { getDbOrNull } from "@/lib/mongodb";
import {
  decryptToken,
  encryptToken,
  generateOAuthState,
  isTokenCryptoConfigured,
} from "@/lib/security/token-crypto";
import { getAuthenticatedUser, type GitHubAuth } from "@/lib/github";

/** Read access to code + metadata. `repo` is required for private repositories. */
export const GITHUB_OAUTH_SCOPES = ["read:user", "repo"] as const;

const CONNECTIONS = "githubConnections";
const OAUTH_STATES = "oauthStates";
const STATE_TTL_MS = 10 * 60 * 1000;

export interface GitHubConnectionPublic {
  connected: boolean;
  githubLogin: string | null;
  githubName: string | null;
  avatarUrl: string | null;
  scopes: string[];
  connectedAt: string | null;
  /** How repository reads are currently authorised. */
  mode: "user_oauth" | "server_pat" | "none";
  /** True when GITHUB_CLIENT_ID/SECRET + TOKEN_ENCRYPTION_KEY are all set. */
  oauthAvailable: boolean;
  /** Present when OAuth cannot be offered, explaining what is missing. */
  unavailableReason?: string;
}

interface StoredConnection {
  ownerId: string;
  githubLogin: string;
  githubName: string | null;
  avatarUrl: string;
  encryptedToken: string;
  scopes: string[];
  connectedAt: string;
  updatedAt: string;
}

// ── In-process fallback used only when MongoDB is unavailable ──
// Values are still encrypted; the map is deliberately not persisted.
interface MemoryStore {
  connections: Map<string, StoredConnection>;
  states: Map<string, { ownerId: string; createdAt: number; returnTo: string }>;
}
const globalRef = globalThis as typeof globalThis & { _aletschGitHubStore?: MemoryStore };
if (!globalRef._aletschGitHubStore) {
  globalRef._aletschGitHubStore = { connections: new Map(), states: new Map() };
}
const memory = globalRef._aletschGitHubStore;

// ────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────

export function isGitHubOAuthConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET && isTokenCryptoConfigured());
}

/** Explains precisely which variable is missing, for the Settings UI. */
export function describeOAuthUnavailability(): string | undefined {
  const missing: string[] = [];
  if (!process.env.GITHUB_CLIENT_ID) missing.push("GITHUB_CLIENT_ID");
  if (!process.env.GITHUB_CLIENT_SECRET) missing.push("GITHUB_CLIENT_SECRET");
  if (!isTokenCryptoConfigured()) missing.push("TOKEN_ENCRYPTION_KEY");
  if (missing.length === 0) return undefined;
  return `GitHub OAuth is not configured. Missing environment variable(s): ${missing.join(", ")}.`;
}

/**
 * Callback URL registered with the GitHub OAuth App. Derived from the
 * incoming request so the same code works on localhost and in
 * deployment, with GITHUB_OAUTH_REDIRECT_BASE as an explicit override.
 */
export function buildRedirectUri(requestUrl: string): string {
  const base = process.env.GITHUB_OAUTH_REDIRECT_BASE?.replace(/\/+$/, "");
  if (base) return `${base}/api/github/callback`;
  return `${new URL(requestUrl).origin}/api/github/callback`;
}

export function buildAuthorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    scope: GITHUB_OAUTH_SCOPES.join(" "),
    state,
    allow_signup: "false",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

// ────────────────────────────────────────────────────────────
// CSRF state
// ────────────────────────────────────────────────────────────

export async function createOAuthState(ownerId: string, returnTo: string): Promise<string> {
  const state = generateOAuthState();
  const createdAt = Date.now();

  const db = await getDbOrNull();
  if (db) {
    await db.collection(OAUTH_STATES).insertOne({
      state,
      ownerId,
      returnTo,
      createdAt: new Date(createdAt).toISOString(),
      expiresAt: new Date(createdAt + STATE_TTL_MS),
    });
  } else {
    memory.states.set(state, { ownerId, createdAt, returnTo });
  }

  return state;
}

/**
 * Validates and single-uses an OAuth `state`. Returns `null` when the
 * state is unknown, expired, or belongs to a different user — which
 * means the callback is rejected rather than trusted.
 */
export async function consumeOAuthState(
  state: string,
  ownerId: string
): Promise<{ returnTo: string } | null> {
  if (!state) return null;

  const db = await getDbOrNull();
  if (db) {
    const doc = await db.collection(OAUTH_STATES).findOneAndDelete({ state, ownerId });
    const record = (doc as any)?.value ?? doc;
    if (!record) return null;
    const createdAt = new Date(record.createdAt).getTime();
    if (Number.isFinite(createdAt) && Date.now() - createdAt > STATE_TTL_MS) return null;
    return { returnTo: record.returnTo || "/repositories" };
  }

  const entry = memory.states.get(state);
  memory.states.delete(state);
  if (!entry || entry.ownerId !== ownerId) return null;
  if (Date.now() - entry.createdAt > STATE_TTL_MS) return null;
  return { returnTo: entry.returnTo };
}

// ────────────────────────────────────────────────────────────
// Token exchange
// ────────────────────────────────────────────────────────────

export interface TokenExchangeResult {
  accessToken: string;
  scopes: string[];
}

/** Exchanges the one-time `code` for an access token. Server-side only. */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<TokenExchangeResult> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed with status ${response.status}.`);
  }

  const data = (await response.json()) as Record<string, string>;
  if (data.error) {
    // `error_description` is GitHub-authored text and contains no secret.
    throw new Error(`GitHub rejected the authorisation: ${data.error_description || data.error}`);
  }
  if (!data.access_token) {
    throw new Error("GitHub token exchange returned no access token.");
  }

  return {
    accessToken: data.access_token,
    scopes: (data.scope || "").split(",").map((s) => s.trim()).filter(Boolean),
  };
}

// ────────────────────────────────────────────────────────────
// Persistence
// ────────────────────────────────────────────────────────────

/** Seals the token and records the connection for this Clerk user. */
export async function saveConnection(
  ownerId: string,
  accessToken: string,
  scopes: string[]
): Promise<GitHubConnectionPublic> {
  const profile = await getAuthenticatedUser({ token: accessToken, source: "user_oauth" });

  const record: StoredConnection = {
    ownerId,
    githubLogin: profile.login,
    githubName: profile.name,
    avatarUrl: profile.avatarUrl,
    encryptedToken: encryptToken(accessToken),
    scopes,
    connectedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const db = await getDbOrNull();
  if (db) {
    await db.collection(CONNECTIONS).replaceOne({ ownerId }, record, { upsert: true });
  } else {
    memory.connections.set(ownerId, record);
  }

  return toPublic(record);
}

async function loadConnection(ownerId: string): Promise<StoredConnection | null> {
  const db = await getDbOrNull();
  if (db) {
    const doc = await db.collection(CONNECTIONS).findOne({ ownerId });
    return doc ? (doc as unknown as StoredConnection) : null;
  }
  return memory.connections.get(ownerId) ?? null;
}

function toPublic(record: StoredConnection): GitHubConnectionPublic {
  return {
    connected: true,
    githubLogin: record.githubLogin,
    githubName: record.githubName,
    avatarUrl: record.avatarUrl,
    scopes: record.scopes,
    connectedAt: record.connectedAt,
    mode: "user_oauth",
    oauthAvailable: isGitHubOAuthConfigured(),
  };
}

/**
 * Connection state for the UI. Contains no token material — only the
 * GitHub login, scopes, and which credential mode is active.
 */
export async function getConnectionStatus(ownerId: string): Promise<GitHubConnectionPublic> {
  const record = await loadConnection(ownerId);
  if (record) return toPublic(record);

  const oauthAvailable = isGitHubOAuthConfigured();
  return {
    connected: false,
    githubLogin: null,
    githubName: null,
    avatarUrl: null,
    scopes: [],
    connectedAt: null,
    mode: process.env.GITHUB_TOKEN ? "server_pat" : "none",
    oauthAvailable,
    unavailableReason: oauthAvailable ? undefined : describeOAuthUnavailability(),
  };
}

export async function deleteConnection(ownerId: string): Promise<boolean> {
  const db = await getDbOrNull();
  if (db) {
    const result = await db.collection(CONNECTIONS).deleteOne({ ownerId });
    return result.deletedCount > 0;
  }
  return memory.connections.delete(ownerId);
}

/**
 * Resolves the credential to use for a user's GitHub calls.
 *
 * Order of preference:
 *   1. the user's own OAuth token  → public + private repositories
 *   2. the server-wide PAT         → public repositories only
 *   3. no credential               → public, heavily rate-limited
 */
export async function resolveGitHubAuth(ownerId: string): Promise<GitHubAuth> {
  const record = await loadConnection(ownerId);
  if (record?.encryptedToken) {
    try {
      return { token: decryptToken(record.encryptedToken), source: "user_oauth" };
    } catch (error) {
      // A decryption failure means TOKEN_ENCRYPTION_KEY changed. Do not
      // crash the request — degrade to the server credential and tell
      // the user to reconnect.
      console.warn("[GitHub] Stored token could not be decrypted; falling back to server credential.");
    }
  }
  if (process.env.GITHUB_TOKEN) return { token: process.env.GITHUB_TOKEN, source: "server_pat" };
  return { source: "none" };
}

/** True when the active credential can read private repositories. */
export async function canAccessPrivateRepos(ownerId: string): Promise<boolean> {
  const auth = await resolveGitHubAuth(ownerId);
  return auth.source === "user_oauth";
}
