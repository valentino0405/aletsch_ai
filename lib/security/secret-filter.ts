// ============================================================
// Aletsch AI — Secret & Sensitive-File Filter
// ------------------------------------------------------------
// Two independent layers of protection:
//
//   1. PATH filtering  — files that must never be fetched from a
//      customer repository at all (.env, private keys, ...).
//   2. CONTENT redaction — if a credential-shaped string somehow
//      reaches us anyway, it is replaced before the text is
//      persisted, logged, or sent to an LLM.
//
// Nothing in this module performs network or disk I/O, so it is
// safe to unit-test in isolation.
// ============================================================

/** Filenames/paths that are never read from an analysed repository. */
const SENSITIVE_PATH_PATTERNS: RegExp[] = [
  // Environment files (.env, .env.local, .env.production, env.sh, ...)
  /(^|\/)\.env($|\.|\/)/i,
  /(^|\/)env\.(sh|bash|zsh|ps1|cmd|bat)$/i,
  // Private keys / certificates / keystores
  /\.(pem|key|p12|pfx|pkcs12|jks|keystore|asc|gpg|ppk)$/i,
  /\.(crt|cer|der)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  // Cloud / tooling credential stores
  /(^|\/)\.aws\//i,
  /(^|\/)\.ssh\//i,
  /(^|\/)\.gnupg\//i,
  /(^|\/)\.kube\/config$/i,
  /(^|\/)\.docker\/config\.json$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)\.pypirc$/i,
  /(^|\/)\.git-credentials$/i,
  // Service accounts, secret bundles, terraform variable files
  /(^|\/)(service-account|serviceaccount|gcloud-key|gcp-key)[^/]*\.json$/i,
  /(^|\/)secrets?(\.|-)[^/]*\.(json|ya?ml|toml|ini|txt|env)$/i,
  /(^|\/)(secrets?|credentials?)\.(json|ya?ml|toml|ini|txt)$/i,
  /\.tfvars(\.json)?$/i,
  /(^|\/)terraform\.tfstate/i,
  // Password databases / dumps
  /\.(kdbx|sqlite-journal)$/i,
  /(^|\/)dump\.rdb$/i,
];

/**
 * True when a repository path must never be downloaded or analysed
 * because it is likely to contain credentials.
 */
export function isSensitivePath(filePath: string): boolean {
  const normalised = filePath.replace(/\\/g, "/");
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(normalised));
}

export interface SecretFinding {
  /** Human-readable name of the credential class that matched. */
  kind: string;
  /** 1-based line number within the scanned text. */
  line: number;
}

interface SecretRule {
  kind: string;
  pattern: RegExp;
  /**
   * When set, only this capture group is replaced, so surrounding
   * syntax (e.g. the `API_KEY=` prefix) survives redaction.
   */
  group?: number;
}

/**
 * Credential-shaped content patterns. Ordered most-specific first so
 * a GitHub token is reported as a GitHub token rather than as a
 * generic high-entropy assignment.
 */
const SECRET_RULES: SecretRule[] = [
  { kind: "private_key_block", pattern: /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g },
  { kind: "github_token", pattern: /\b(gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  { kind: "openai_key", pattern: /\bsk-(?:proj-|ant-|or-)?[A-Za-z0-9_-]{20,}\b/g },
  { kind: "aws_access_key_id", pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g },
  { kind: "google_api_key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: "slack_token", pattern: /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/g },
  { kind: "stripe_key", pattern: /\b(?:sk|rk|pk)_(?:live|test)_[0-9A-Za-z]{16,}\b/g },
  { kind: "clerk_secret_key", pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/g },
  { kind: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { kind: "mongodb_credentials", pattern: /\bmongodb(?:\+srv)?:\/\/[^:\s/]+:([^@\s]+)@/gi, group: 1 },
  { kind: "postgres_credentials", pattern: /\b(?:postgres(?:ql)?|mysql|redis|amqp):\/\/[^:\s/]+:([^@\s]+)@/gi, group: 1 },
  {
    kind: "credential_assignment",
    // FOO_SECRET = "value" / FOO_TOKEN: 'value' — captures only the value.
    pattern:
      /\b[A-Za-z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET|AUTH[_-]?KEY)[A-Za-z0-9_]*[ \t]*[:=][ \t]*["']?([^\s"',;}]{8,})["']?/gi,
    group: 1,
  },
];

/** Placeholder substituted for every redacted credential. */
export const REDACTION_PLACEHOLDER = "[REDACTED_BY_ALETSCH]";

/** Values that look credential-shaped but are obviously placeholders. */
const PLACEHOLDER_VALUES =
  /^(?:your[_-]?|my[_-]?|example|changeme|placeholder|xxx+|<.*>|\$\{.*\}|process\.env|undefined|null|true|false|\*+|\.{3,})/i;

function lineNumberAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

/** Reports every credential-shaped substring without modifying the input. */
export function scanForSecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  if (!text) return findings;

  for (const rule of SECRET_RULES) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const value = rule.group ? match[rule.group] : match[0];
      if (!value) continue;
      if (rule.group && PLACEHOLDER_VALUES.test(value)) continue;
      findings.push({ kind: rule.kind, line: lineNumberAt(text, match.index) });
      if (match[0].length === 0) pattern.lastIndex++; // guard against zero-width loops
    }
  }

  return findings;
}

export interface RedactionResult {
  text: string;
  findings: SecretFinding[];
  redactedCount: number;
}

/**
 * Replaces every credential-shaped substring with a placeholder.
 * Always call this before persisting repository content, writing it to
 * a log, or including it in an LLM prompt.
 */
export function redactSecrets(text: string): RedactionResult {
  if (!text) return { text: text ?? "", findings: [], redactedCount: 0 };

  const findings = scanForSecrets(text);
  let output = text;
  let redactedCount = 0;

  for (const rule of SECRET_RULES) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    output = output.replace(pattern, (full, ...groups) => {
      if (!rule.group) {
        redactedCount++;
        return REDACTION_PLACEHOLDER;
      }
      const value = groups[rule.group - 1] as string | undefined;
      if (!value || PLACEHOLDER_VALUES.test(value)) return full;
      redactedCount++;
      return full.replace(value, REDACTION_PLACEHOLDER);
    });
  }

  return { text: output, findings, redactedCount };
}

/**
 * Prepares arbitrary repository text for an LLM prompt:
 * redacts credentials and truncates to a bounded length so a huge file
 * cannot blow the context window.
 */
export function sanitizeForLLM(text: string, maxChars = 4000): string {
  const { text: redacted } = redactSecrets(text ?? "");
  if (redacted.length <= maxChars) return redacted;
  return `${redacted.slice(0, maxChars)}\n/* …truncated by Aletsch AI… */`;
}

/**
 * Safe console logging helper — redacts before it ever reaches stdout.
 * Used instead of bare `console.log` anywhere repository- or
 * credential-adjacent strings could appear.
 */
export function safeLog(scope: string, message: string): void {
  console.log(`[${scope}] ${redactSecrets(message).text}`);
}
