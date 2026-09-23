import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FunnelRequestError,
  parseFunnelRequest,
  parseFunnelSearchParams,
} from "@/lib/analytics/funnel-request";
import { DAY_MS, DEFAULT_CONVERSION_WINDOW_MS, HOUR_MS } from "@/lib/analytics/time";

const NOW = new Date("2026-03-31T12:00:00.000Z");

function parse(body: Record<string, unknown>) {
  return parseFunnelRequest(body, { now: NOW });
}

/** The smallest body that should be accepted. */
function minimal(extra: Record<string, unknown> = {}) {
  return { steps: ["signup", "login"], ...extra };
}

function expectRejection(body: unknown, expected: RegExp) {
  assert.throws(
    () => parseFunnelRequest(body, { now: NOW }),
    (error: unknown) => {
      assert.ok(error instanceof FunnelRequestError, `expected a FunnelRequestError, got ${error}`);
      assert.match(error.message, expected);
      return true;
    }
  );
}

// ── Steps ───────────────────────────────────────────────────

test("a two-step funnel is the minimum accepted", () => {
  const query = parse(minimal());

  assert.equal(query.steps.length, 2);
  assert.deepEqual(
    query.steps.map((step) => step.eventName),
    ["signup", "login"]
  );
});

test("fewer than two steps measures no conversion and is rejected", () => {
  expectRejection({ steps: ["signup"] }, /at least 2 steps/);
  expectRejection({ steps: [] }, /at least 2 steps/);
});

test("more than ten steps is rejected", () => {
  const steps = Array.from({ length: 11 }, (_, index) => `step_${index}`);
  expectRejection({ steps }, /limited to 10 steps/);
});

test("a missing or non-array steps list is rejected", () => {
  expectRejection({}, /needs a list of steps/);
  expectRejection({ steps: "signup,login" }, /needs a list of steps/);
});

test("a step may be a bare event name or a full object", () => {
  const query = parse({
    steps: ["signup", { eventName: "login", name: "Signed in" }],
  });

  assert.equal(query.steps[0].name, undefined, "shorthand carries no display name");
  assert.equal(query.steps[1].name, "Signed in");
});

test("the saved-funnel `event` key is accepted alongside `eventName`", () => {
  // app/api/funnels stores steps as { name, event }; a saved funnel must
  // be runnable through this endpoint without being rewritten first.
  const query = parse({
    steps: [
      { name: "Signed up", event: "signup" },
      { name: "Logged in", event: "login" },
    ],
  });

  assert.deepEqual(
    query.steps.map((step) => step.eventName),
    ["signup", "login"]
  );
});

test("a step with no event names the position that is wrong", () => {
  expectRejection({ steps: ["signup", { name: "Logged in" }] }, /Step 2 needs an event/);
  expectRejection({ steps: ["signup", "   "] }, /Step 2 needs an event/);
  expectRejection({ steps: ["signup", 42] }, /Step 2 is not a valid step/);
  expectRejection({ steps: ["signup", null] }, /Step 2 is not a valid step/);
});

test("event names are trimmed but not otherwise rewritten", () => {
  // The ingest layer already normalised what is in the database. Renaming
  // here would stop a step matching the events it names.
  const query = parse({ steps: ["  form_submit_event_form  ", "login"] });

  assert.equal(query.steps[0].eventName, "form_submit_event_form");
});

test("an absurdly long event name is rejected rather than truncated", () => {
  expectRejection({ steps: ["signup", "x".repeat(200)] }, /Step 2 has an event name that is too long/);
});

test("a step display name is bounded", () => {
  const query = parse({
    steps: ["signup", { eventName: "login", name: "L".repeat(200) }],
  });

  assert.equal(query.steps[1].name?.length, 80);
});

// ── Conversion window ───────────────────────────────────────

test("the conversion window defaults rather than being left undefined", () => {
  assert.equal(parse(minimal()).conversionWindowMs, DEFAULT_CONVERSION_WINDOW_MS);
});

test("a window is accepted as a value plus unit", () => {
  assert.equal(parse(minimal({ conversionWindow: 7, conversionWindowUnit: "days" })).conversionWindowMs, 7 * DAY_MS);
  assert.equal(parse(minimal({ conversionWindow: 6, conversionWindowUnit: "hours" })).conversionWindowMs, 6 * HOUR_MS);
  assert.equal(parse(minimal({ conversionWindow: "30" })).conversionWindowMs, 30 * DAY_MS, "days is the default unit");
});

test("an explicit millisecond window is accepted", () => {
  assert.equal(parse(minimal({ conversionWindowMs: 90_000 })).conversionWindowMs, 90_000);
});

test("a window of zero or less would make every funnel unconvertible", () => {
  expectRejection(minimal({ conversionWindow: 0 }), /longer than zero/);
  expectRejection(minimal({ conversionWindow: -7 }), /longer than zero/);
  expectRejection(minimal({ conversionWindowMs: 0 }), /longer than zero/);
});

test("a window beyond 90 days is rejected", () => {
  expectRejection(minimal({ conversionWindow: 120 }), /limited to 90 days/);
});

test("an unparseable window is rejected rather than silently defaulted", () => {
  expectRejection(minimal({ conversionWindow: "soon" }), /must be a number/);
  expectRejection(minimal({ conversionWindow: 7, conversionWindowUnit: "fortnights" }), /minutes, hours or days/);
});

// ── Funnel semantics ────────────────────────────────────────

test("a funnel is closed and sequential unless asked otherwise", () => {
  const query = parse(minimal());

  assert.equal(query.funnelType, "closed");
  assert.equal(query.stepOrder, "sequential");
  assert.equal(query.countMethod, "unique_users");
});

test("open funnels and any-order matching are opt-in", () => {
  const query = parse(minimal({ funnelType: "open", stepOrder: "any_order" }));

  assert.equal(query.funnelType, "open");
  assert.equal(query.stepOrder, "any_order");
});

test("an unrecognised funnelType falls back to the stricter reading", () => {
  // Defaulting to `open` on a typo would inflate every conversion rate.
  assert.equal(parse(minimal({ funnelType: "半open" })).funnelType, "closed");
  assert.equal(parse(minimal({ stepOrder: "whatever" })).stepOrder, "sequential");
});

// ── Date range ──────────────────────────────────────────────

test("the range defaults to 30 days and is resolved against the clock passed in", () => {
  const query = parse(minimal());

  assert.equal(query.range.key, "30d");
  assert.equal(query.range.endIso, NOW.toISOString());
});

test("a preset range is honoured", () => {
  assert.equal(parse(minimal({ dateRange: "24h" })).range.key, "24h");
  assert.equal(parse(minimal({ dateRange: "90d" })).range.days, 90);
});

test("a custom range includes the whole of its final calendar day", () => {
  const query = parse(minimal({ dateRange: "custom", startDate: "2026-03-01", endDate: "2026-03-03" }));

  assert.equal(query.range.startIso, "2026-03-01T00:00:00.000Z");
  assert.equal(query.range.endIso, "2026-03-04T00:00:00.000Z");
});

test("an impossible range is reported as a request error, not a range error", () => {
  // The route only catches FunnelRequestError; an AnalyticsRangeError
  // escaping here would surface as a 500 instead of a 400.
  expectRejection(
    minimal({ dateRange: "custom", startDate: "2026-03-10", endDate: "2026-03-01" }),
    /end date must be after/
  );
  expectRejection(minimal({ dateRange: "custom", startDate: "not-a-date" }), /valid dates/);
});

// ── Filters and breakdown ───────────────────────────────────

test("global and per-step filters are parsed", () => {
  const query = parse({
    steps: ["signup", { eventName: "login", filters: [{ field: "path", operator: "equals", value: "/login" }] }],
    filters: [{ field: "device", operator: "equals", value: "mobile" }],
  });

  assert.deepEqual(query.filters, [{ field: "device", operator: "equals", value: "mobile" }]);
  assert.equal(query.steps[1].filters?.length, 1);
  assert.equal(query.steps[0].filters, undefined, "an unfiltered step carries no empty array");
});

test("an unknown filter field is rejected, naming where it was found", () => {
  expectRejection(
    minimal({ filters: [{ field: "sneaky", operator: "equals", value: "x" }] }),
    /sneaky/
  );
  expectRejection(
    { steps: ["signup", { eventName: "login", filters: [{ field: "$where", operator: "equals", value: "x" }] }] },
    /step 2/
  );
});

test("a property filter is addressable by prefix", () => {
  const query = parse(minimal({ filters: [{ field: "properties.plan", operator: "equals", value: "pro" }] }));

  assert.equal(query.filters[0].field, "properties.plan");
});

test("no breakdown is null rather than absent", () => {
  assert.equal(parse(minimal()).breakdown, null);
  assert.equal(parse(minimal({ breakdown: "" })).breakdown, null);
  assert.equal(parse(minimal({ breakdown: null })).breakdown, null);
});

test("a known breakdown is accepted and an unknown one rejected", () => {
  assert.equal(parse(minimal({ breakdown: "device" })).breakdown, "device");
  assert.equal(parse(minimal({ breakdown: "properties.plan" })).breakdown, "properties.plan");
  expectRejection(minimal({ breakdown: "salary" }), /cannot be used as a breakdown/);
});

// ── Body shape ──────────────────────────────────────────────

test("a body that is not an object is rejected", () => {
  expectRejection(null, /must be a funnel definition/);
  expectRejection("steps", /must be a funnel definition/);
  expectRejection([{ eventName: "signup" }], /must be a funnel definition/);
});

// ── Query-string form ───────────────────────────────────────

test("a funnel can be expressed entirely in a query string", () => {
  const query = parseFunnelSearchParams(
    new URLSearchParams({
      steps: "signup, login ,project_created",
      dateRange: "7d",
      conversionWindow: "1",
      conversionWindowUnit: "days",
      funnelType: "open",
      breakdown: "browser",
    }),
    { now: NOW }
  );

  assert.deepEqual(
    query.steps.map((step) => step.eventName),
    ["signup", "login", "project_created"]
  );
  assert.equal(query.range.key, "7d");
  assert.equal(query.conversionWindowMs, DAY_MS);
  assert.equal(query.funnelType, "open");
  assert.equal(query.breakdown, "browser");
});

test("a query string with no steps is rejected like any other empty funnel", () => {
  assert.throws(
    () => parseFunnelSearchParams(new URLSearchParams({ dateRange: "7d" }), { now: NOW }),
    FunnelRequestError
  );
});
