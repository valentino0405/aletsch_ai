// ============================================================
// Aletsch AI — Token encryption at rest (AES-256-GCM)
// ------------------------------------------------------------
// GitHub access tokens are never stored in plaintext. They are
// sealed with a key derived from TOKEN_ENCRYPTION_KEY and only
// opened server-side, immediately before a GitHub API call.
// ============================================================

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const VERSION = "v1";

export class TokenCryptoNotConfiguredError extends Error {
  constructor() {
    super(
      "TOKEN_ENCRYPTION_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
    this.name = "TokenCryptoNotConfiguredError";
  }
}

export function isTokenCryptoConfigured(): boolean {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  return typeof raw === "string" && raw.length >= 16;
}

/**
 * Derives a stable 32-byte key from the configured secret. Accepts any
 * sufficiently long secret (base64, hex, or passphrase) so deployment
 * does not depend on a specific encoding.
 */
function deriveKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw || raw.length < 16) throw new TokenCryptoNotConfiguredError();
  return createHash("sha256").update(raw, "utf8").digest();
}

/** Returns `v1:<iv>:<authTag>:<ciphertext>`, all base64url. */
export function encryptToken(plaintext: string): string {
  if (!plaintext) throw new Error("Cannot encrypt an empty token.");
  const key = deriveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

/** Reverses {@link encryptToken}. Throws if the payload was tampered with. */
export function decryptToken(sealed: string): string {
  if (!sealed) throw new Error("Cannot decrypt an empty payload.");
  const parts = sealed.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unrecognised encrypted token format.");
  }
  const key = deriveKey();
  const iv = Buffer.from(parts[1], "base64url");
  const authTag = Buffer.from(parts[2], "base64url");
  const ciphertext = Buffer.from(parts[3], "base64url");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Opaque per-project key used by the telemetry SDK to authorise
 * `POST /api/ingest`. Safe to embed in a client bundle: it only grants
 * append-only event writes for one project.
 */
export function generateProjectWriteKey(): string {
  return `alt_pk_${randomBytes(24).toString("base64url")}`;
}

/** Random, unguessable OAuth `state` value. */
export function generateOAuthState(): string {
  return randomBytes(24).toString("base64url");
}
