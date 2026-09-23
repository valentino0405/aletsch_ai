import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_FUNNEL_STEPS,
  SCENARIOS,
  createRandom,
  findScenario,
  generateScenario,
  requiredConversionWindowMs,
  type SyntheticPayload,
} from "@/lib/analytics/synthetic";
import { buildJourneys, computeFunnelAnalysis } from "@/lib/analytics/funnel-engine";
import { MINUTE_MS } from "@/lib/analytics/time";
import type { AnalyticsEvent, FunnelStepSpec, UserEventStream } from "@/lib/analytics/types";

const NOW = new Date("2026-03-31T00:00:00.000Z");
const PROJECT = "6aa8fcba834a91bc587f0420";

function generate(key: string, scale = 1) {
  const scenario = findScenario(key);
  assert.ok(scenario, `scenario ${key} should exist`);
  return generateScenario({ projectId: PROJECT, scenario, now: NOW, scale });
}

/**
 * Regroup generated payloads into the streams the engine consumes, the
 * same way lib/analytics/event-stream does after a database read. This
 * lets the generator be measured by the real engine without a database
 * in the loop.
 */
function toStreams(payloads: SyntheticPayload[]): UserEventStream[] {
  const byUser = new Map<string, AnalyticsEvent[]>();

  for (const payload of payloads) {
    const event: AnalyticsEvent = {
      userId: payload.distinctId,
      sessionId: payload.sessionId,
      eventName: payload.event,
      timestamp: Date.parse(payload.timestamp),
      path: payload.path,
      category: "Interaction",
      referrer: payload.referrer,
      device: payload.context.device,
      browser: payload.context.browser,
      os: payload.context.os,
      country: payload.context.country,
      source: payload.source,
      properties: payload.properties,
    };
    const existing = byUser.get(event.userId);
    if (existing) existing.push(event);
    else byUser.set(event.userId, [event]);
  }

  return [...byUser.entries()].map(([userId, events]) => ({
    userId,
    events: events.sort((a, b) => a.timestamp - b.timestamp),
  }));
}

const DEMO_STEPS: FunnelStepSpec[] = DEMO_FUNNEL_STEPS.map((step) => ({
  eventName: step.eventName,
  name: step.name,
}));

function analyse(payloads: SyntheticPayload[], conversionWindowMs: number) {
  const journeys = buildJourneys(toStreams(payloads), DEMO_STEPS, {
    conversionWindowMs,
    funnelType: "closed",
    stepOrder: "sequential",
  });
  return computeFunnelAnalysis(journeys, DEMO_STEPS);
}

// ── The load-bearing test ───────────────────────────────────

test("the controlled scenario measures as exactly the funnel it declares", () => {
  // If this drifts, either the generator or the engine changed meaning,
  // and the end-to-end verification script would be measuring nothing.
  const { payloads, expected } = generate("controlled-funnel");
  const scenario = findScenario("controlled-funnel")!;

  const analysis = analyse(payloads, requiredConversionWindowMs(scenario));

  assert.deepEqual(
    analysis.steps.map((step) => step.users),
    [1000, 800, 600, 350, 210]
  );
  assert.deepEqual(
    analysis.steps.map((step) => step.dropOffUsers),
    [0, 200, 200, 250, 140]
  );
  assert.equal(analysis.totalUsers, 1000);
  assert.equal(analysis.convertedUsers, 210);
  assert.equal(analysis.overallConversionRate, 21);
  assert.equal(analysis.averageTimeToConvertMs, 40 * MINUTE_MS);

  // And the expectation the verification script asserts against agrees.
  assert.equal(expected.overallConversionRate, 21);
  assert.equal(expected.convertedUsers, 210);
  assert.equal(expected.averageTimeToConvertMs, 40 * MINUTE_MS);
  assert.deepEqual(
    expected.steps.map((step) => step.users),
    [1000, 800, 600, 350, 210]
  );
});

test("every scenario measures as the funnel it declares", () => {
  for (const scenario of SCENARIOS) {
    const { payloads, expected } = generate(scenario.key);
    const analysis = analyse(payloads, requiredConversionWindowMs(scenario));

    assert.deepEqual(
      analysis.steps.map((step) => step.users),
      scenario.stepCounts,
      `${scenario.key} step counts`
    );
    assert.equal(analysis.overallConversionRate, expected.overallConversionRate, `${scenario.key} rate`);
  }
});

test("the drop-off scenarios drop off where their names say they do", () => {
  const cases: Array<[string, string, string]> = [
    ["login-dropoff", "signup", "login"],
    ["project-dropoff", "login", "project_created"],
    ["invite-dropoff", "project_created", "invite_sent"],
  ];

  for (const [key, fromEvent, toEvent] of cases) {
    const scenario = findScenario(key)!;
    const { payloads } = generate(key);
    const analysis = analyse(payloads, requiredConversionWindowMs(scenario));

    assert.equal(analysis.largestDropOff?.fromEvent, fromEvent, `${key} from`);
    assert.equal(analysis.largestDropOff?.toEvent, toEvent, `${key} to`);
  }
});

test("full conversion reports 100%, not a rounded approximation of it", () => {
  const scenario = findScenario("full-conversion")!;
  const { payloads } = generate("full-conversion");
  const analysis = analyse(payloads, requiredConversionWindowMs(scenario));

  assert.equal(analysis.overallConversionRate, 100);
  assert.equal(analysis.convertedUsers, analysis.totalUsers);
  assert.deepEqual(
    analysis.steps.map((step) => step.dropOffUsers),
    [0, 0, 0, 0, 0]
  );
});

// ── Determinism ─────────────────────────────────────────────

test("the same seed produces byte-identical output", () => {
  const first = generate("mixed-realistic").payloads;
  const second = generate("mixed-realistic").payloads;

  assert.equal(first.length, second.length);
  assert.deepEqual(first, second);
});

test("a different project gets different traffic, not a copy", () => {
  const scenario = findScenario("mixed-realistic")!;
  const a = generateScenario({ projectId: "project_a", scenario, now: NOW });
  const b = generateScenario({ projectId: "project_b", scenario, now: NOW });

  assert.notDeepEqual(a.payloads[0], b.payloads[0], "dimensions and timings differ");
  assert.deepEqual(a.expected.steps, b.expected.steps, "but the funnel shape is the same");
});

test("the random source is stable across runs and varies with the seed", () => {
  const first = createRandom("aletsch");
  const second = createRandom("aletsch");
  const other = createRandom("aletsch-2");

  const a = Array.from({ length: 5 }, () => first());
  const b = Array.from({ length: 5 }, () => second());
  const c = Array.from({ length: 5 }, () => other());

  assert.deepEqual(a, b, "the same seed replays exactly");
  assert.notDeepEqual(a, c, "a different seed does not");
  assert.ok(a.every((value) => value >= 0 && value < 1));
});

// ── Safety properties ───────────────────────────────────────

test("every generated event is marked as synthetic", () => {
  const { payloads } = generate("mixed-realistic");

  for (const payload of payloads) {
    assert.equal(payload.source, "synthetic");
    assert.equal(payload.properties.synthetic, true);
  }
});

test("no generated identity resembles a real person", () => {
  const { payloads } = generate("mixed-realistic");
  const identifiers = new Set(payloads.map((payload) => payload.distinctId));

  for (const identifier of identifiers) {
    assert.match(identifier, /^demo_user_\d{5}$/);
  }
  for (const payload of payloads) {
    // No names, emails or anything that could be mistaken for one.
    assert.equal(/@/.test(JSON.stringify(payload.properties)), false);
  }
});

test("background events never borrow a funnel step's name", () => {
  // Noise that reused a step name would silently change the measured
  // funnel, and the scenario's declared counts would become a lie.
  const { payloads } = generate("mixed-realistic");
  const stepNames = new Set(DEMO_FUNNEL_STEPS.map((step) => step.eventName));

  const noise = payloads.filter((payload) => payload.properties.stepIndex === undefined);
  assert.ok(noise.length > 0, "the realistic scenario should emit background traffic");

  for (const payload of noise) {
    assert.equal(stepNames.has(payload.event as never), false, `${payload.event} collides with a step`);
  }
});

test("nothing is timestamped in the future or outside the scenario's window", () => {
  const scenario = findScenario("mixed-realistic")!;
  const { payloads } = generate("mixed-realistic");

  const earliest = NOW.getTime() - (scenario.spreadDays + 1) * 24 * 60 * 60 * 1000;
  for (const payload of payloads) {
    const ms = Date.parse(payload.timestamp);
    assert.ok(ms <= NOW.getTime(), `${payload.timestamp} is in the future`);
    assert.ok(ms >= earliest, `${payload.timestamp} predates the window`);
  }
});

test("payloads arrive in chronological order, like a real stream", () => {
  const { payloads } = generate("mixed-realistic");

  for (let index = 1; index < payloads.length; index += 1) {
    assert.ok(payloads[index - 1].timestamp <= payloads[index].timestamp);
  }
});

test("each user's steps are strictly ordered in time", () => {
  const { payloads } = generate("controlled-funnel");
  const byUser = new Map<string, SyntheticPayload[]>();

  for (const payload of payloads) {
    const list = byUser.get(payload.distinctId) ?? [];
    list.push(payload);
    byUser.set(payload.distinctId, list);
  }

  for (const [userId, events] of byUser) {
    for (let index = 1; index < events.length; index += 1) {
      assert.ok(
        Date.parse(events[index - 1].timestamp) < Date.parse(events[index].timestamp),
        `${userId} has two steps at the same instant`
      );
    }
  }
});

// ── Scale ───────────────────────────────────────────────────

test("scaling preserves the shape of the funnel", () => {
  const { payloads, expected } = generate("controlled-funnel", 0.1);
  const scenario = findScenario("controlled-funnel")!;
  const analysis = analyse(payloads, requiredConversionWindowMs(scenario));

  assert.deepEqual(
    analysis.steps.map((step) => step.users),
    [100, 80, 60, 35, 21]
  );
  assert.equal(analysis.overallConversionRate, 21);
  assert.equal(expected.totalUsers, 100);
});

test("an impossible scenario is refused rather than generated", () => {
  assert.throws(
    () =>
      generateScenario({
        projectId: PROJECT,
        now: NOW,
        scenario: {
          key: "impossible",
          label: "",
          description: "",
          stepCounts: [100, 200],
          stepDelayMinutes: [0, 5],
          jitterMinutes: 0,
          spreadDays: 1,
          noisePerUser: 0,
        },
      }),
    /more users than step 1/
  );
});

test("an unknown scenario key resolves to nothing", () => {
  assert.equal(findScenario("does-not-exist"), null);
  assert.equal(findScenario(""), null);
});
