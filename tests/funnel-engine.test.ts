import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildJourneys,
  buildUserJourney,
  computeFunnelAnalysis,
  computeFunnelBreakdown,
} from "@/lib/analytics/funnel-engine";
import { DAY_MS, HOUR_MS, MINUTE_MS, resolveDateRange } from "@/lib/analytics/time";
import { buildEventQuery, toAnalyticsEvent } from "@/lib/analytics/event-stream";
import type { AnalyticsEvent, FunnelStepSpec, UserEventStream } from "@/lib/analytics/types";

// ── Fixtures ────────────────────────────────────────────────
// Times are minutes from a fixed epoch so every expectation below is a
// literal, not a computation against the wall clock.

const T0 = Date.parse("2026-03-01T00:00:00.000Z");

function at(minutes: number): number {
  return T0 + minutes * MINUTE_MS;
}

function ev(
  eventName: string,
  minutes: number,
  extra: Partial<AnalyticsEvent> = {}
): AnalyticsEvent {
  return {
    userId: "u",
    sessionId: "s1",
    eventName,
    timestamp: at(minutes),
    path: "/",
    category: "Interaction",
    referrer: "",
    properties: {},
    ...extra,
  };
}

function stream(userId: string, events: AnalyticsEvent[]): UserEventStream {
  return { userId, events: events.map((event) => ({ ...event, userId })) };
}

function steps(...names: string[]): FunnelStepSpec[] {
  return names.map((eventName) => ({ eventName }));
}

const CLOSED_7D = {
  conversionWindowMs: 7 * DAY_MS,
  funnelType: "closed" as const,
  stepOrder: "sequential" as const,
};

const FOUR_STEPS = steps("page_view", "signup", "project_created", "invite_sent");

// ════════════════════════════════════════════════════════════
// 1. A user who completes every step
// ════════════════════════════════════════════════════════════

test("a user who fires every step in order completes the funnel", () => {
  const journey = buildUserJourney(
    stream("u1", [
      ev("page_view", 0),
      ev("signup", 5),
      ev("project_created", 20),
      ev("invite_sent", 45),
    ]),
    FOUR_STEPS,
    CLOSED_7D
  );

  assert.ok(journey);
  assert.equal(journey.entryStep, 0);
  assert.equal(journey.stepTimes.length, 4, "reached all four steps");
  assert.deepEqual(journey.stepTimes, [at(0), at(5), at(20), at(45)]);
});

// ════════════════════════════════════════════════════════════
// 2. Users dropping at each step
// ════════════════════════════════════════════════════════════

test("each user is counted only through the last step they actually reached", () => {
  const journeys = buildJourneys(
    [
      stream("drops_at_1", [ev("page_view", 0)]),
      stream("drops_at_2", [ev("page_view", 0), ev("signup", 3)]),
      stream("drops_at_3", [ev("page_view", 0), ev("signup", 3), ev("project_created", 9)]),
      stream("converts", [
        ev("page_view", 0),
        ev("signup", 3),
        ev("project_created", 9),
        ev("invite_sent", 30),
      ]),
    ],
    FOUR_STEPS,
    CLOSED_7D
  );

  const result = computeFunnelAnalysis(journeys, FOUR_STEPS);

  assert.deepEqual(result.steps.map((step) => step.users), [4, 3, 2, 1]);
  assert.deepEqual(result.steps.map((step) => step.dropOffUsers), [0, 1, 1, 1]);
  assert.equal(result.totalUsers, 4);
  assert.equal(result.convertedUsers, 1);
  assert.equal(result.overallConversionRate, 25);
});

// ════════════════════════════════════════════════════════════
// 3 & 6. Repeated events count once, from the earliest occurrence
// ════════════════════════════════════════════════════════════

test("a step fired nine times counts the user once, at the first occurrence", () => {
  const repeated = stream("u1", [
    ev("page_view", 0),
    ev("signup", 10),
    ev("signup", 12),
    ev("signup", 14),
    ev("project_created", 20),
  ]);

  const journey = buildUserJourney(repeated, FOUR_STEPS, CLOSED_7D)!;
  assert.deepEqual(journey.stepTimes, [at(0), at(10), at(20)], "the 12- and 14-minute repeats are ignored");

  const result = computeFunnelAnalysis([journey], FOUR_STEPS);
  assert.deepEqual(result.steps.map((step) => step.users), [1, 1, 1, 0], "one user, not three");
  assert.equal(result.steps[1].averageTimeFromPreviousMs, 10 * MINUTE_MS);
});

test("a funnel listing the same event twice needs two separate occurrences", () => {
  const twoStep = steps("page_view", "page_view");

  const once = buildUserJourney(stream("u1", [ev("page_view", 0)]), twoStep, CLOSED_7D)!;
  assert.equal(once.stepTimes.length, 1, "one pageview cannot satisfy both steps");

  const twice = buildUserJourney(
    stream("u2", [ev("page_view", 0), ev("page_view", 8)]),
    twoStep,
    CLOSED_7D
  )!;
  assert.deepEqual(twice.stepTimes, [at(0), at(8)]);
});

// ════════════════════════════════════════════════════════════
// 4. Out-of-order sequences do not convert
// ════════════════════════════════════════════════════════════

test("steps fired in the wrong order do not complete the funnel", () => {
  // The spec's example: signup 09:01, project_created 09:10, login 09:12
  // measured against signup -> login -> project_created.
  const journey = buildUserJourney(
    stream("u1", [ev("signup", 1), ev("project_created", 10), ev("login", 12)]),
    steps("signup", "login", "project_created"),
    CLOSED_7D
  )!;

  assert.equal(journey.stepTimes.length, 2, "reaches login, but no project_created follows it");
  assert.deepEqual(journey.stepTimes, [at(1), at(12)]);
});

test("any_order mode accepts the same sequence the sequential mode rejects", () => {
  const journey = buildUserJourney(
    stream("u1", [ev("signup", 1), ev("project_created", 10), ev("login", 12)]),
    steps("signup", "login", "project_created"),
    { ...CLOSED_7D, stepOrder: "any_order" }
  )!;

  assert.equal(journey.stepTimes.length, 3);
  // Step times are monotonic: by minute 12 the user had done signup and
  // login; project_created at minute 10 was already behind them.
  assert.deepEqual(journey.stepTimes, [at(1), at(12), at(12)]);
  assert.ok(journey.stepTimes.every((time, i) => i === 0 || time >= journey.stepTimes[i - 1]));
});

// ════════════════════════════════════════════════════════════
// 5. Multiple sessions
// ════════════════════════════════════════════════════════════

test("a funnel spans sessions — the user is the unit, not the session", () => {
  const journey = buildUserJourney(
    stream("u1", [
      ev("page_view", 0, { sessionId: "session_a" }),
      ev("signup", 5, { sessionId: "session_a" }),
      // Comes back two days later in a new session.
      ev("project_created", 2880, { sessionId: "session_b" }),
      ev("invite_sent", 2890, { sessionId: "session_b" }),
    ]),
    FOUR_STEPS,
    CLOSED_7D
  )!;

  assert.equal(journey.stepTimes.length, 4);
  assert.equal(journey.stepTimes[3] - journey.stepTimes[0], 2890 * MINUTE_MS);
});

// ════════════════════════════════════════════════════════════
// 7. The conversion window
// ════════════════════════════════════════════════════════════

test("the conversion window is measured from funnel entry, not from the previous step", () => {
  const events = stream("u1", [
    ev("page_view", 0),
    ev("signup", 60 * 20), // 20h in
    ev("project_created", 60 * 26), // 26h in — within a day of signup, but not of entry
  ]);
  const threeSteps = steps("page_view", "signup", "project_created");

  const oneDay = buildUserJourney(events, threeSteps, { ...CLOSED_7D, conversionWindowMs: DAY_MS })!;
  assert.equal(oneDay.stepTimes.length, 2, "project_created falls outside the 24h window from entry");

  const twoDays = buildUserJourney(events, threeSteps, {
    ...CLOSED_7D,
    conversionWindowMs: 2 * DAY_MS,
  })!;
  assert.equal(twoDays.stepTimes.length, 3);
});

test("a step landing exactly on the deadline counts; a millisecond later does not", () => {
  const twoSteps = steps("a", "b");
  const onTime = stream("u1", [ev("a", 0), { ...ev("b", 0), timestamp: at(0) + HOUR_MS }]);
  const lateByOneMs = stream("u2", [ev("a", 0), { ...ev("b", 0), timestamp: at(0) + HOUR_MS + 1 }]);

  const options = { ...CLOSED_7D, conversionWindowMs: HOUR_MS };
  assert.equal(buildUserJourney(onTime, twoSteps, options)!.stepTimes.length, 2);
  assert.equal(buildUserJourney(lateByOneMs, twoSteps, options)!.stepTimes.length, 1);
});

// ════════════════════════════════════════════════════════════
// 8 & 9. Open vs closed funnels
// ════════════════════════════════════════════════════════════

test("a closed funnel ignores users who never fired the first step", () => {
  const latecomer = stream("u1", [ev("signup", 0), ev("project_created", 10)]);

  assert.equal(
    buildUserJourney(latecomer, FOUR_STEPS, CLOSED_7D),
    null,
    "no page_view means no entry"
  );
});

test("an open funnel admits users at the step where they first appear", () => {
  const latecomer = stream("u1", [ev("signup", 0), ev("project_created", 10)]);

  const journey = buildUserJourney(latecomer, FOUR_STEPS, {
    ...CLOSED_7D,
    funnelType: "open",
  })!;

  assert.equal(journey.entryStep, 1, "entered at signup");
  assert.deepEqual(journey.stepTimes, [at(0), at(10)]);

  // They count towards steps 2 and 3, and towards nothing before that.
  const result = computeFunnelAnalysis([journey], FOUR_STEPS);
  assert.deepEqual(result.steps.map((step) => step.users), [0, 1, 1, 0]);
});

test("open entry resolves to the earliest matching step when one event fits several", () => {
  const journey = buildUserJourney(
    stream("u1", [ev("ping", 0), ev("ping", 5)]),
    steps("ping", "ping"),
    { ...CLOSED_7D, funnelType: "open" }
  )!;

  assert.equal(journey.entryStep, 0, "never credited with skipping ahead");
});

// ════════════════════════════════════════════════════════════
// 10. Date range filtering reaches the query
// ════════════════════════════════════════════════════════════

test("the date range becomes a bounded timestamp predicate on the query", () => {
  const range = resolveDateRange("7d", { now: new Date("2026-03-08T12:00:00.000Z") });

  assert.equal(range.startIso, "2026-03-01T12:00:00.000Z");
  assert.equal(range.endIso, "2026-03-08T12:00:00.000Z");

  const query = buildEventQuery(["p1"], range, { eventNames: ["signup"] });

  assert.deepEqual(query.projectId, { $in: ["p1"] });
  assert.deepEqual(query.timestamp, {
    $gte: "2026-03-01T12:00:00.000Z",
    $lt: "2026-03-08T12:00:00.000Z",
  });
  assert.deepEqual(query.eventName, { $in: ["signup"] });
});

test("a custom range is inclusive of the final calendar day", () => {
  const range = resolveDateRange("custom", { startDate: "2026-03-01", endDate: "2026-03-03" });

  assert.equal(range.startIso, "2026-03-01T00:00:00.000Z");
  assert.equal(range.endIso, "2026-03-04T00:00:00.000Z", "March 3rd is included in full");
});

// ════════════════════════════════════════════════════════════
// 11 & 12. Empty and near-empty datasets
// ════════════════════════════════════════════════════════════

test("an empty dataset reports no events rather than a zero conversion rate", () => {
  const result = computeFunnelAnalysis([], FOUR_STEPS, {
    anyEventsInRange: false,
    anyStepEventsInRange: false,
  });

  assert.equal(result.dataState, "no_events");
  assert.equal(result.overallConversionRate, null, "no rate is invented from zero users");
  assert.equal(result.totalUsers, 0);
  assert.equal(result.largestDropOff, null);
  assert.deepEqual(result.steps.map((step) => step.users), [0, 0, 0, 0]);
});

test("events that exist but never match the steps are distinguished from no events at all", () => {
  const result = computeFunnelAnalysis([], FOUR_STEPS, {
    anyEventsInRange: true,
    anyStepEventsInRange: false,
  });

  assert.equal(result.dataState, "no_step_events");
});

test("step events that exist while nobody enters is a third, distinct state", () => {
  const result = computeFunnelAnalysis([], FOUR_STEPS, {
    anyEventsInRange: true,
    anyStepEventsInRange: true,
  });

  assert.equal(result.dataState, "no_entries");
});

test("a project emitting a single event type fills only the first step", () => {
  const journeys = buildJourneys(
    [stream("u1", [ev("page_view", 0)]), stream("u2", [ev("page_view", 3)])],
    FOUR_STEPS,
    CLOSED_7D
  );

  const result = computeFunnelAnalysis(journeys, FOUR_STEPS);

  assert.equal(result.dataState, "ok", "two users really did enter");
  assert.deepEqual(result.steps.map((step) => step.users), [2, 0, 0, 0]);
  assert.equal(result.overallConversionRate, 0, "a genuine zero, not an absence");
  assert.equal(result.steps[1].conversionRate, 0);
  assert.equal(result.averageTimeToConvertMs, null, "nobody converted, so there is no time to report");
});

// ════════════════════════════════════════════════════════════
// 14. User isolation
// ════════════════════════════════════════════════════════════

test("one user's steps never complete another user's funnel", () => {
  const journeys = buildJourneys(
    [
      stream("alice", [ev("page_view", 0), ev("signup", 2)]),
      stream("bob", [ev("project_created", 4), ev("invite_sent", 6)]),
    ],
    FOUR_STEPS,
    CLOSED_7D
  );

  assert.equal(journeys.length, 1, "bob never fired page_view, so he never entered");
  const result = computeFunnelAnalysis(journeys, FOUR_STEPS);
  assert.deepEqual(result.steps.map((step) => step.users), [1, 1, 0, 0]);
  assert.equal(result.convertedUsers, 0);
});

// ════════════════════════════════════════════════════════════
// 15. Breakdowns
// ════════════════════════════════════════════════════════════

test("a breakdown splits the funnel by the dimension on each user's entry event", () => {
  const journeys = buildJourneys(
    [
      stream("m1", [ev("page_view", 0, { device: "mobile" }), ev("signup", 2, { device: "mobile" })]),
      stream("m2", [ev("page_view", 0, { device: "mobile" })]),
      stream("d1", [
        ev("page_view", 0, { device: "desktop" }),
        ev("signup", 1, { device: "desktop" }),
      ]),
    ],
    steps("page_view", "signup"),
    { ...CLOSED_7D, dimensions: ["device"] }
  );

  const breakdown = computeFunnelBreakdown(journeys, "device", 2);

  assert.equal(breakdown.available, true);
  assert.deepEqual(breakdown.buckets, [
    { value: "mobile", users: 2, convertedUsers: 1, conversionRate: 50, dropOffUsers: 1 },
    { value: "desktop", users: 1, convertedUsers: 1, conversionRate: 100, dropOffUsers: 0 },
  ]);
  assert.equal(breakdown.unknownUsers, 0);
});

test("a dimension no event carries is reported as unavailable, never as empty buckets", () => {
  const journeys = buildJourneys(
    [stream("u1", [ev("page_view", 0), ev("signup", 2)])],
    steps("page_view", "signup"),
    { ...CLOSED_7D, dimensions: ["country"] }
  );

  const breakdown = computeFunnelBreakdown(journeys, "country", 2);

  assert.equal(breakdown.available, false);
  assert.deepEqual(breakdown.buckets, []);
  assert.equal(breakdown.unknownUsers, 1);
  assert.match(breakdown.reason ?? "", /No country data available/);
});

test("a user whose entry event lacks the dimension is counted as unknown, not dropped", () => {
  const journeys = buildJourneys(
    [
      stream("known", [ev("page_view", 0, { device: "mobile" })]),
      stream("unknown", [ev("page_view", 0)]),
    ],
    steps("page_view", "signup"),
    { ...CLOSED_7D, dimensions: ["device"] }
  );

  const breakdown = computeFunnelBreakdown(journeys, "device", 2);

  assert.equal(breakdown.unknownUsers, 1);
  assert.equal(breakdown.buckets[0].users, 1);
});

// ════════════════════════════════════════════════════════════
// 16. Time to convert
// ════════════════════════════════════════════════════════════

test("average and median time to convert are computed from real timestamps", () => {
  const twoSteps = steps("a", "b");
  const journeys = buildJourneys(
    [
      stream("fast", [ev("a", 0), ev("b", 10)]),
      stream("medium", [ev("a", 0), ev("b", 20)]),
      stream("slow", [ev("a", 0), ev("b", 120)]),
      stream("never", [ev("a", 0)]),
    ],
    twoSteps,
    CLOSED_7D
  );

  const result = computeFunnelAnalysis(journeys, twoSteps);

  // (10 + 20 + 120) / 3 = 50 minutes. The user who never converted
  // contributes nothing — including them as a zero would be a fiction.
  assert.equal(result.averageTimeToConvertMs, 50 * MINUTE_MS);
  assert.equal(result.medianTimeToConvertMs, 20 * MINUTE_MS);
  assert.equal(result.steps[1].averageTimeFromPreviousMs, 50 * MINUTE_MS);
});

test("the median of an even number of conversions averages the middle two", () => {
  const twoSteps = steps("a", "b");
  const journeys = buildJourneys(
    [
      stream("u1", [ev("a", 0), ev("b", 10)]),
      stream("u2", [ev("a", 0), ev("b", 20)]),
      stream("u3", [ev("a", 0), ev("b", 30)]),
      stream("u4", [ev("a", 0), ev("b", 100)]),
    ],
    twoSteps,
    CLOSED_7D
  );

  const result = computeFunnelAnalysis(journeys, twoSteps);
  assert.equal(result.medianTimeToConvertMs, 25 * MINUTE_MS);
  assert.equal(result.averageTimeToConvertMs, 40 * MINUTE_MS);
});

// ════════════════════════════════════════════════════════════
// Step filters
// ════════════════════════════════════════════════════════════

test("a step filter narrows which occurrences of an event can satisfy it", () => {
  const filtered: FunnelStepSpec[] = [
    { eventName: "page_view", filters: [{ field: "path", operator: "contains", value: "/pricing" }] },
    { eventName: "signup" },
  ];

  const journey = buildUserJourney(
    stream("u1", [
      ev("page_view", 0, { path: "/home" }),
      ev("page_view", 5, { path: "/pricing" }),
      ev("signup", 9),
    ]),
    filtered,
    CLOSED_7D
  )!;

  assert.deepEqual(journey.stepTimes, [at(5), at(9)], "the /home view does not open the funnel");
});

test("a user whose events never satisfy a step filter never enters", () => {
  const filtered: FunnelStepSpec[] = [
    { eventName: "page_view", filters: [{ field: "path", operator: "equals", value: "/pricing" }] },
    { eventName: "signup" },
  ];

  assert.equal(
    buildUserJourney(stream("u1", [ev("page_view", 0, { path: "/home" }), ev("signup", 2)]), filtered, CLOSED_7D),
    null
  );
});

// ════════════════════════════════════════════════════════════
// Drop-off identification
// ════════════════════════════════════════════════════════════

test("the largest drop-off is the steepest local loss, not the biggest headcount", () => {
  const threeSteps = steps("a", "b", "c");
  const journeys: UserEventStream[] = [];

  // a -> b loses 400 of 1000 (40%). b -> c loses 500 of 600 (83.3%).
  for (let i = 0; i < 1000; i += 1) {
    const events = [ev("a", 0)];
    if (i < 600) events.push(ev("b", 1));
    if (i < 100) events.push(ev("c", 2));
    journeys.push(stream(`u${i}`, events));
  }

  const result = computeFunnelAnalysis(buildJourneys(journeys, threeSteps, CLOSED_7D), threeSteps);

  assert.deepEqual(result.steps.map((step) => step.users), [1000, 600, 100]);
  assert.equal(result.largestDropOff?.fromEvent, "b");
  assert.equal(result.largestDropOff?.toEvent, "c");
  assert.equal(result.largestDropOff?.rate, 83.3);
  assert.equal(result.largestDropOff?.users, 500);
});

test("a funnel with no loss still reports a drop-off, at zero", () => {
  const twoSteps = steps("a", "b");
  const journeys = buildJourneys(
    [stream("u1", [ev("a", 0), ev("b", 1)]), stream("u2", [ev("a", 0), ev("b", 1)])],
    twoSteps,
    CLOSED_7D
  );

  const result = computeFunnelAnalysis(journeys, twoSteps);
  assert.equal(result.overallConversionRate, 100);
  assert.equal(result.largestDropOff?.rate, 0);
});

test("the first step is never itself a drop-off", () => {
  const journeys = buildJourneys([stream("u1", [ev("a", 0)])], steps("a", "b"), CLOSED_7D);
  const result = computeFunnelAnalysis(journeys, steps("a", "b"));

  assert.equal(result.steps[0].dropOffUsers, 0);
  assert.equal(result.steps[0].dropOffRate, 0);
  assert.equal(result.steps[0].conversionRate, null, "there is no previous step to convert from");
});

// ════════════════════════════════════════════════════════════
// The specified ground-truth fixture (§37/§58)
// ════════════════════════════════════════════════════════════

test("the controlled fixture reproduces the specified ground truth exactly", () => {
  // 1000 enter, then 800 / 600 / 350 / 210 reach each subsequent step.
  const COHORTS = [1000, 800, 600, 350, 210];
  const fixtureSteps = steps("page_view", "signup", "login", "project_created", "invite_sent");

  const streams: UserEventStream[] = [];
  for (let i = 0; i < COHORTS[0]; i += 1) {
    const events: AnalyticsEvent[] = [];
    for (let stepIndex = 0; stepIndex < COHORTS.length; stepIndex += 1) {
      if (i < COHORTS[stepIndex]) events.push(ev(fixtureSteps[stepIndex].eventName, stepIndex * 10));
    }
    streams.push(stream(`user_${i}`, events));
  }

  const result = computeFunnelAnalysis(buildJourneys(streams, fixtureSteps, CLOSED_7D), fixtureSteps);

  assert.deepEqual(result.steps.map((step) => step.users), [1000, 800, 600, 350, 210]);
  assert.deepEqual(result.steps.map((step) => step.dropOffUsers), [0, 200, 200, 250, 140]);
  assert.equal(result.totalUsers, 1000);
  assert.equal(result.convertedUsers, 210);
  assert.equal(result.overallConversionRate, 21, "210 of 1000");

  assert.deepEqual(
    result.steps.map((step) => step.conversionRate),
    [null, 80, 75, 58.3, 60]
  );
  assert.deepEqual(
    result.steps.map((step) => step.percentOfEntry),
    [100, 80, 60, 35, 21]
  );

  // 250 of 600 is the steepest single loss in this shape.
  assert.equal(result.largestDropOff?.fromEvent, "login");
  assert.equal(result.largestDropOff?.toEvent, "project_created");
  assert.equal(result.largestDropOff?.rate, 41.7);

  // Every step is 10 minutes after the one before it.
  assert.equal(result.averageTimeToConvertMs, 40 * MINUTE_MS);
  assert.equal(result.steps[2].averageTimeFromPreviousMs, 10 * MINUTE_MS);
});

// ════════════════════════════════════════════════════════════
// Malformed data
// ════════════════════════════════════════════════════════════

test("events missing a user, a name or a usable timestamp are rejected, not coerced", () => {
  assert.equal(toAnalyticsEvent({ userId: "", eventName: "a", timestamp: "2026-03-01T00:00:00Z" }), null);
  assert.equal(toAnalyticsEvent({ userId: "u", eventName: "", timestamp: "2026-03-01T00:00:00Z" }), null);
  assert.equal(toAnalyticsEvent({ userId: "u", eventName: "a", timestamp: "not-a-date" }), null);
  assert.equal(toAnalyticsEvent({ userId: "u", eventName: "a" }), null);

  const valid = toAnalyticsEvent({
    userId: "u",
    eventName: "a",
    timestamp: "2026-03-01T00:00:00.000Z",
    properties: { plan: "pro", seats: 4, trial: true, nested: { no: 1 } },
  });

  assert.ok(valid);
  assert.equal(valid.timestamp, Date.parse("2026-03-01T00:00:00.000Z"));
  assert.deepEqual(valid.properties, { plan: "pro", seats: 4, trial: true }, "nested objects are dropped");
  assert.equal(valid.sessionId, "session_unknown", "a missing session does not invalidate the event");
});

test("a Date or epoch timestamp is accepted as readily as an ISO string", () => {
  const fromDate = toAnalyticsEvent({ userId: "u", eventName: "a", timestamp: new Date(T0) });
  const fromNumber = toAnalyticsEvent({ userId: "u", eventName: "a", timestamp: T0 });

  assert.equal(fromDate?.timestamp, T0);
  assert.equal(fromNumber?.timestamp, T0);
});
