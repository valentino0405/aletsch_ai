import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AT_RISK_THRESHOLD,
  computeFunnelMetrics,
  formatRate,
  humanizeEventName,
} from "@/lib/analytics/funnel";

const derived = { name: "Observed User Journey", source: "derived-from-events" as const };

function counts(...pairs: Array<[string, number]>) {
  return pairs.map(([event, users]) => ({ name: humanizeEventName(event), event, users }));
}

// ── The specified worked example ────────────────────────────
// "If 100 users reach a step and 70 reach the next, that is a 70%
//  conversion and a 30% drop-off."

test("100 users into a step with 70 continuing is 70% conversion and 30% drop-off", () => {
  const result = computeFunnelMetrics(counts(["page_view", 100], ["sign_up", 70]), derived);

  assert.equal(result.totalUsers, 100);
  assert.equal(result.steps[1].percent, 70);
  assert.equal(result.steps[1].dropFromPrevious, 30);
  assert.equal(result.conversionRate, 70);
  assert.deepEqual(result.largestDropoff, { from: "Page View", to: "Sign Up", rate: 30 });
  assert.equal(result.insufficientData, false);
});

// ── Conversion is end-to-end, not step-to-step ─────────────

test("conversion rate measures the final step against the first", () => {
  const result = computeFunnelMetrics(
    counts(["page_view", 200], ["sign_up", 100], ["login", 50], ["task_created", 20]),
    derived
  );

  assert.equal(result.conversionRate, 10, "20 of 200 completed the journey");
  assert.deepEqual(
    result.steps.map((step) => step.percent),
    [100, 50, 25, 10]
  );
});

test("drop and dropFromPrevious measure against different baselines", () => {
  const result = computeFunnelMetrics(counts(["a", 100], ["b", 50], ["c", 25]), derived);

  // b -> c loses 25 users: a quarter of the entry cohort, but half of b.
  assert.equal(result.steps[2].drop, 25, "share of the entry cohort");
  assert.equal(result.steps[2].dropFromPrevious, 50, "share of the previous step");
});

// ── The largest drop-off is the local one ──────────────────

test("largest drop-off is the steepest step-to-step loss, not the biggest headcount", () => {
  // a->b loses 40 users (40% of b's inflow); b->c loses 50 (83% of c's inflow).
  const result = computeFunnelMetrics(counts(["a", 100], ["b", 60], ["c", 10]), derived);

  assert.equal(result.largestDropoff?.from, "B");
  assert.equal(result.largestDropoff?.to, "C");
  assert.equal(result.largestDropoff?.rate, 83.3);
});

test("a funnel with no loss reports a zero-rate drop-off", () => {
  const result = computeFunnelMetrics(counts(["a", 40], ["b", 40], ["c", 40]), derived);

  assert.equal(result.conversionRate, 100);
  assert.equal(result.largestDropoff?.rate, 0);
  assert.equal(result.atRiskCount, 0);
});

// ── At-risk counting ───────────────────────────────────────

test("only steps at or above the at-risk threshold are counted", () => {
  assert.equal(AT_RISK_THRESHOLD, 25, "the fixtures below are chosen to straddle this value");

  // b loses 20% (safe), c loses exactly 25% (the boundary), d loses 50%.
  const result = computeFunnelMetrics(
    counts(["a", 100], ["b", 80], ["c", 60], ["d", 30]),
    derived
  );

  assert.deepEqual(
    result.steps.map((step) => step.dropFromPrevious),
    [0, 20, 25, 50]
  );
  assert.equal(result.atRiskCount, 2, "c sits exactly on the threshold and counts; b does not");
});

test("the first step is never counted as a drop-off", () => {
  const result = computeFunnelMetrics(counts(["a", 100], ["b", 1]), derived);

  assert.equal(result.steps[0].drop, 0);
  assert.equal(result.steps[0].dropFromPrevious, 0);
  assert.equal(result.atRiskCount, 1);
});

// ── Honesty about missing data ─────────────────────────────

test("an empty entry cohort yields no rates at all", () => {
  const result = computeFunnelMetrics(counts(["a", 0], ["b", 0]), derived);

  assert.equal(result.insufficientData, true);
  assert.equal(result.conversionRate, null, "no rate is invented from zero users");
  assert.equal(result.largestDropoff, null);
  assert.equal(result.atRiskCount, 0);
});

test("a null conversion rate renders as an explicit absence, not 0%", () => {
  assert.equal(formatRate(null), "Insufficient data");
  assert.equal(formatRate(0), "0.0%");
  assert.equal(formatRate(70), "70.0%");
});

test("no steps at all is insufficient data rather than a crash", () => {
  const result = computeFunnelMetrics([], derived);

  assert.equal(result.insufficientData, true);
  assert.equal(result.conversionRate, null);
  assert.deepEqual(result.steps, []);
});

// ── A step can gain users ──────────────────────────────────

test("a step reached by more users than the one before it is not a negative drop", () => {
  // Users can reach a later event without emitting the earlier one.
  const result = computeFunnelMetrics(counts(["a", 50], ["b", 80]), derived);

  assert.equal(result.steps[1].percent, 160);
  assert.equal(result.steps[1].dropFromPrevious, -60, "reported as measured, not clamped");
  assert.equal(result.atRiskCount, 0);
});

// ── Naming ─────────────────────────────────────────────────

test("event names become readable step labels", () => {
  assert.equal(humanizeEventName("task_created"), "Task Created");
  assert.equal(humanizeEventName("checkout.payment-complete"), "Checkout Payment Complete");
  assert.equal(humanizeEventName("login"), "Login");
});

test("the definition's name and source are carried through to the result", () => {
  const result = computeFunnelMetrics(counts(["a", 10], ["b", 5]), {
    name: "Checkout",
    source: "saved",
  });

  assert.equal(result.funnelName, "Checkout");
  assert.equal(result.source, "saved");
});
