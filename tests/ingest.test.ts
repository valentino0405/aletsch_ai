import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PROPERTY_COUNT,
  MAX_PROPERTY_VALUE_LENGTH,
  isSensitiveKey,
  looksLikeCredential,
  normalizeEventName,
  normalizeIngestPayload,
  normalizePath,
  normalizeReferrer,
  normalizeTimestamp,
  sanitizeProperties,
} from "@/lib/analytics/ingest";
import { consume, resetRateLimiter } from "@/lib/security/rate-limit";

// ── Validation ──────────────────────────────────────────────

test("a payload without a project id is rejected", () => {
  const result = normalizeIngestPayload({ event: "clicked" });
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /projectId/);
});

test("a payload without an event name is rejected", () => {
  const result = normalizeIngestPayload({ projectId: "p1" });
  assert.equal(result.ok, false);
});

test("both the tracker's `event` and the legacy `eventName` are accepted", () => {
  const modern = normalizeIngestPayload({ projectId: "p1", event: "checkout_started" });
  const legacy = normalizeIngestPayload({ projectId: "p1", eventName: "checkout_started" });

  assert.equal(modern.ok && modern.event.eventName, "checkout_started");
  assert.equal(legacy.ok && legacy.event.eventName, "checkout_started");
});

test("an event name of only unusable characters is rejected rather than stored blank", () => {
  const result = normalizeIngestPayload({ projectId: "p1", event: "!!!" });
  assert.equal(result.ok, false);
});

// ── Event names ─────────────────────────────────────────────

test("event names are constrained to a safe character set", () => {
  assert.equal(normalizeEventName("Checkout Started!"), "Checkout_Started");
  assert.equal(normalizeEventName("  padded  "), "padded");
  assert.equal(normalizeEventName("a$$$b"), "a_b", "runs of replacements collapse");
});

test("a mongo operator cannot be smuggled in as an event name", () => {
  const result = normalizeIngestPayload({ projectId: "p1", event: '$ne' });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.event.eventName, "ne");
});

test("a very long event name is truncated, not rejected", () => {
  const result = normalizeIngestPayload({ projectId: "p1", event: "a".repeat(500) });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.event.eventName.length, 120);
});

// ── Paths and referrers ─────────────────────────────────────

test("query strings are stripped from the path", () => {
  // Reset tokens and invite codes live in query strings.
  assert.equal(normalizePath("/reset?token=abc123&email=a@b.com"), "/reset");
  assert.equal(normalizePath("/page#section"), "/page");
});

test("a full URL passed as a path is reduced to its path", () => {
  assert.equal(normalizePath("https://app.example.com/checkout?cart=9"), "/checkout");
});

test("a path is always rooted", () => {
  assert.equal(normalizePath("checkout"), "/checkout");
  assert.equal(normalizePath(""), "/");
});

test("only the referrer's origin is kept", () => {
  assert.equal(normalizeReferrer("https://google.com/search?q=secret+query"), "https://google.com");
  assert.equal(normalizeReferrer("not a url"), "");
  assert.equal(normalizeReferrer(""), "");
});

// ── Secret filtering ────────────────────────────────────────

test("credential-shaped property keys are recognised in any casing or compound", () => {
  for (const key of [
    "password",
    "userPassword",
    "API_KEY",
    "stripe_secret_key",
    "authToken",
    "refresh_token",
    "Authorization",
    "cardNumber",
    "cvv",
    "client_secret",
  ]) {
    assert.equal(isSensitiveKey(key), true, `${key} should be treated as sensitive`);
  }
});

test("ordinary property keys are not over-matched", () => {
  for (const key of ["component", "route", "label", "plan", "quantity", "elementText"]) {
    assert.equal(isSensitiveKey(key), false, `${key} should be allowed`);
  }
});

test("values shaped like credentials are dropped whatever the key is called", () => {
  assert.equal(looksLikeCredential("ghp_" + "a".repeat(36)), true);
  assert.equal(looksLikeCredential("sk-" + "b".repeat(32)), true);
  assert.equal(looksLikeCredential("xoxb-123456789012-abcdefghij"), true);
  assert.equal(looksLikeCredential("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig"), true);
  assert.equal(looksLikeCredential("-----BEGIN RSA PRIVATE KEY-----"), true);
  assert.equal(looksLikeCredential("checkout"), false);
});

test("a whole form object passed to track() has its secrets stripped", () => {
  const { properties, redactedKeys } = sanitizeProperties({
    email: "user@example.com",
    password: "hunter2",
    confirmPassword: "hunter2",
    plan: "pro",
    csrfToken: "abc",
  });

  assert.deepEqual(properties, { email: "user@example.com", plan: "pro" });
  assert.deepEqual(redactedKeys.sort(), ["confirmPassword", "csrfToken", "password"]);
});

test("a leaked token in an innocuously-named field is still dropped", () => {
  const { properties, redactedKeys } = sanitizeProperties({
    note: "ghp_" + "x".repeat(36),
    label: "Buy now",
  });

  assert.deepEqual(properties, { label: "Buy now" });
  assert.deepEqual(redactedKeys, ["note"]);
});

test("redacted keys are reported back so the developer can fix the call site", () => {
  const result = normalizeIngestPayload({
    projectId: "p1",
    event: "signup_submitted",
    properties: { password: "x" },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.event.redactedKeys, ["password"]);
});

// ── Bounding the payload ────────────────────────────────────

test("nested objects and arrays are dropped rather than stored", () => {
  const { properties } = sanitizeProperties({
    label: "ok",
    nested: { a: 1 },
    list: [1, 2, 3],
    fn: () => undefined,
    nothing: null,
  });

  assert.deepEqual(properties, { label: "ok" });
});

test("the property count is capped", () => {
  const input: Record<string, number> = {};
  for (let i = 0; i < MAX_PROPERTY_COUNT + 25; i += 1) input[`k${i}`] = i;

  const { properties } = sanitizeProperties(input);
  assert.equal(Object.keys(properties).length, MAX_PROPERTY_COUNT);
});

test("long string values are truncated", () => {
  const { properties } = sanitizeProperties({ blob: "z".repeat(5000) });
  assert.equal((properties.blob as string).length, MAX_PROPERTY_VALUE_LENGTH);
});

test("non-finite numbers are dropped", () => {
  const { properties } = sanitizeProperties({ a: Infinity, b: NaN, c: 42 });
  assert.deepEqual(properties, { c: 42 });
});

test("booleans and zero survive", () => {
  const { properties } = sanitizeProperties({ ok: false, count: 0 });
  assert.deepEqual(properties, { ok: false, count: 0 });
});

// ── Timestamps ──────────────────────────────────────────────

test("a plausible client timestamp is kept", () => {
  const now = Date.UTC(2026, 0, 15, 12, 0, 0);
  const sent = new Date(now - 5000).toISOString();
  assert.equal(normalizeTimestamp(sent, now), sent);
});

test("a client clock skewed beyond a day falls back to server time", () => {
  const now = Date.UTC(2026, 0, 15, 12, 0, 0);
  const future = new Date(now + 40 * 24 * 60 * 60 * 1000).toISOString();

  assert.equal(normalizeTimestamp(future, now), new Date(now).toISOString());
  assert.equal(normalizeTimestamp("not a date", now), new Date(now).toISOString());
  assert.equal(normalizeTimestamp(undefined, now), new Date(now).toISOString());
});

// ── Identity ────────────────────────────────────────────────

test("distinctId falls back through userId and anonymousId", () => {
  const explicit = normalizeIngestPayload({ projectId: "p", event: "e", distinctId: "d1" });
  const legacyUser = normalizeIngestPayload({ projectId: "p", event: "e", userId: "u1" });
  const anon = normalizeIngestPayload({ projectId: "p", event: "e", anonymousId: "a1" });
  const none = normalizeIngestPayload({ projectId: "p", event: "e" });

  assert.equal(explicit.ok && explicit.event.distinctId, "d1");
  assert.equal(legacyUser.ok && legacyUser.event.distinctId, "u1");
  assert.equal(anon.ok && anon.event.distinctId, "a1");
  assert.equal(none.ok && none.event.distinctId, "anonymous");
});

// ── Categorisation ──────────────────────────────────────────

test("a category is inferred when the caller omits one", () => {
  const cases: Array<[string, string]> = [
    ["page_view", "Pageview"],
    ["signup_form_submitted", "Form"],
    ["user_login", "Conversion"],
    ["button_clicked", "Interaction"],
  ];

  for (const [event, expected] of cases) {
    const result = normalizeIngestPayload({ projectId: "p", event });
    assert.equal(result.ok && result.event.category, expected, event);
  }
});

test("an explicit category is respected", () => {
  const result = normalizeIngestPayload({ projectId: "p", event: "x", category: "Custom" });
  assert.equal(result.ok && result.event.category, "Custom");
});

// ── Rate limiting ───────────────────────────────────────────

test("requests are allowed up to the limit and refused after it", () => {
  resetRateLimiter();
  const now = 1_000_000;

  for (let i = 0; i < 5; i += 1) {
    const result = consume("k", 5, 60_000, now);
    assert.equal(result.allowed, true, `request ${i + 1} of 5`);
  }

  const sixth = consume("k", 5, 60_000, now);
  assert.equal(sixth.allowed, false);
  assert.equal(sixth.remaining, 0);
  assert.ok(sixth.retryAfterSeconds > 0);
});

test("the window resets and the budget returns", () => {
  resetRateLimiter();
  const now = 2_000_000;

  consume("k", 1, 60_000, now);
  assert.equal(consume("k", 1, 60_000, now).allowed, false);
  assert.equal(consume("k", 1, 60_000, now + 60_001).allowed, true, "a new window starts");
});

test("separate keys have separate budgets", () => {
  resetRateLimiter();
  const now = 3_000_000;

  consume("project-a", 1, 60_000, now);
  assert.equal(consume("project-a", 1, 60_000, now).allowed, false);
  assert.equal(consume("project-b", 1, 60_000, now).allowed, true, "one noisy client cannot starve another");
});

test("remaining budget is reported accurately", () => {
  resetRateLimiter();
  const now = 4_000_000;

  assert.equal(consume("k", 3, 60_000, now).remaining, 2);
  assert.equal(consume("k", 3, 60_000, now).remaining, 1);
  assert.equal(consume("k", 3, 60_000, now).remaining, 0);
});
