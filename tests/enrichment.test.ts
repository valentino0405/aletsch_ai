import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contextFromRequest,
  normalizeCountry,
  normalizeDeclaredContext,
  normalizeSource,
  parseUserAgent,
  resolveEventContext,
} from "@/lib/analytics/enrichment";
import { normalizeIngestPayload } from "@/lib/analytics/ingest";

// ── User-Agent classification ───────────────────────────────
// The orderings below are the whole point of the parser: nearly every
// modern UA string contains the names of the browsers it is not.

test("Chrome on Windows is not mistaken for Safari", () => {
  const context = parseUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );

  assert.deepEqual(context, { device: "desktop", browser: "Chrome", os: "Windows" });
});

test("Edge is not mistaken for Chrome", () => {
  const context = parseUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.2478.67"
  );

  assert.equal(context.browser, "Edge");
});

test("an iPhone reports iOS rather than macOS", () => {
  const context = parseUserAgent(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
  );

  assert.deepEqual(context, { device: "mobile", browser: "Safari", os: "iOS" });
});

test("an iPad is a tablet, not a phone", () => {
  const context = parseUserAgent(
    "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/604.1"
  );

  assert.equal(context.device, "tablet");
  assert.equal(context.os, "iOS");
});

test("Android with Mobile is a phone; Android without it is a tablet", () => {
  const phone = parseUserAgent(
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
  );
  const tablet = parseUserAgent(
    "Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );

  assert.equal(phone.device, "mobile");
  assert.equal(phone.os, "Android");
  assert.equal(tablet.device, "tablet");
});

test("Safari on macOS is identified by the absence of every other browser", () => {
  const context = parseUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
  );

  assert.deepEqual(context, { device: "desktop", browser: "Safari", os: "macOS" });
});

test("Firefox on Linux is classified without a Chrome fallback", () => {
  const context = parseUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0");

  assert.deepEqual(context, { device: "desktop", browser: "Firefox", os: "Linux" });
});

test("crawlers are bucketed as bots so they do not pollute device breakdowns", () => {
  assert.equal(parseUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)").device, "bot");
  assert.equal(parseUserAgent("HeadlessChrome/124.0.0.0").device, "bot");
});

test("an unrecognisable User-Agent yields absence, not a guess", () => {
  assert.deepEqual(parseUserAgent("curl/8.4.0"), { device: undefined, browser: undefined, os: undefined });
  assert.deepEqual(parseUserAgent(""), {});
  assert.deepEqual(parseUserAgent(null), {});
  assert.deepEqual(parseUserAgent(undefined), {});
});

// ── Geo headers ─────────────────────────────────────────────

test("a country is read from whichever edge header the deployment sets", () => {
  const vercel = contextFromRequest(new Headers({ "x-vercel-ip-country": "de" }));
  const cloudflare = contextFromRequest(new Headers({ "cf-ipcountry": "JP" }));

  assert.equal(vercel.country, "DE", "normalised to uppercase");
  assert.equal(cloudflare.country, "JP");
});

test("Cloudflare's anonymised and Tor placeholders are not countries", () => {
  assert.equal(normalizeCountry("XX"), undefined);
  assert.equal(normalizeCountry("T1"), undefined);
  assert.equal(normalizeCountry("USA"), undefined, "alpha-3 is not the expected format");
  assert.equal(normalizeCountry(""), undefined);
  assert.equal(normalizeCountry(42), undefined);
  assert.equal(normalizeCountry("us"), "US");
});

test("a request behind no geo proxy simply has no country", () => {
  const context = contextFromRequest(new Headers({ "user-agent": "curl/8.4.0" }));
  assert.equal(context.country, undefined);
});

// ── Declared context ────────────────────────────────────────

test("a declared context is constrained to label-safe characters", () => {
  const context = normalizeDeclaredContext({
    device: "MOBILE",
    browser: "Chrome",
    os: "Android",
    country: "in",
  });

  assert.deepEqual(context, { device: "mobile", browser: "Chrome", os: "Android", country: "IN" });
});

test("a hostile declared context cannot smuggle operators into a field", () => {
  const context = normalizeDeclaredContext({
    device: "$ne",
    browser: { $gt: "" },
    os: "Linux;drop",
    country: "'; DROP",
  });

  assert.equal(context.device, "ne", "the operator sigil is stripped");
  assert.equal(context.browser, undefined, "a non-string is discarded outright");
  assert.equal(context.os, "Linuxdrop");
  assert.equal(context.country, undefined);
});

test("a non-object context is ignored rather than throwing", () => {
  assert.deepEqual(normalizeDeclaredContext(null), {});
  assert.deepEqual(normalizeDeclaredContext("mobile"), {});
  assert.deepEqual(normalizeDeclaredContext(["mobile"]), {});
});

// ── Precedence ──────────────────────────────────────────────

test("server-derived context wins over anything the caller declared", () => {
  const resolved = resolveEventContext(
    { device: "desktop", browser: "Firefox", os: "Linux" },
    { device: "mobile", browser: "Chrome", os: "Android", country: "FR" }
  );

  assert.deepEqual(resolved, {
    device: "desktop",
    browser: "Firefox",
    os: "Linux",
    country: "FR",
  });
});

test("declared values fill only the gaps the headers left", () => {
  const resolved = resolveEventContext({ device: "desktop" }, { browser: "Chrome", country: "BR" });

  assert.deepEqual(resolved, { device: "desktop", browser: "Chrome", country: "BR" });
});

test("an absent dimension is omitted entirely, never set to undefined", () => {
  const resolved = resolveEventContext({}, {});

  assert.deepEqual(resolved, {});
  assert.deepEqual(Object.keys(resolved), [], "no key exists for $exists to find");
});

// ── Source marking ──────────────────────────────────────────

test("generated traffic is marked so it can be labelled and excluded", () => {
  assert.equal(normalizeSource("synthetic"), "synthetic");
  assert.equal(normalizeSource("SYNTHETIC"), "synthetic");
  assert.equal(normalizeSource("server"), "server");
});

test("an unrecognised or missing source defaults to real web traffic", () => {
  assert.equal(normalizeSource(undefined), "web");
  assert.equal(normalizeSource("totally-real"), "web");
  assert.equal(normalizeSource(99), "web");
});

// ── Backwards compatibility with the existing tracker ───────

test("a payload from the existing tracker still normalises, with defaults", () => {
  const result = normalizeIngestPayload({
    projectId: "p1",
    event: "signup",
    distinctId: "anon_1",
    sessionId: "sess_1",
    timestamp: new Date().toISOString(),
    path: "/signup",
  });

  assert.ok(result.ok);
  assert.equal(result.event.source, "web", "an unmarked event is real traffic");
  assert.deepEqual(result.event.declaredContext, {}, "no context is claimed on its behalf");
});

test("a payload may declare context and source without affecting the rest", () => {
  const result = normalizeIngestPayload({
    projectId: "p1",
    event: "signup",
    distinctId: "u1",
    sessionId: "sess_1",
    timestamp: new Date().toISOString(),
    source: "synthetic",
    context: { device: "mobile", country: "IN" },
  });

  assert.ok(result.ok);
  assert.equal(result.event.source, "synthetic");
  assert.equal(result.event.declaredContext.device, "mobile");
  assert.equal(result.event.declaredContext.country, "IN");
  assert.equal(result.event.eventName, "signup", "normalisation is otherwise unchanged");
});
