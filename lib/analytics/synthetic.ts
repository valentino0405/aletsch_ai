// ============================================================
// Aletsch AI — Synthetic traffic generator
// ------------------------------------------------------------
// Aletsch cannot be demonstrated, or verified end to end, without events.
// A brand-new project has none, and waiting for real users is not a
// development loop.
//
// The important design decision here is what this module does *not* do:
// it does not write funnel results, and it does not write to the events
// collection. It produces ingest payloads — the same shape a browser
// sends — which the caller posts to the real POST /api/ingest. They pass
// through the same validation, the same redaction, the same enrichment
// and the same session stitching as production traffic, and the funnel
// engine then measures them without knowing they were generated.
//
// That is the only way generated data is worth anything: if it took a
// shortcut past the pipeline, a green demo would prove nothing about the
// pipeline.
//
// Two safeguards on the data itself:
//   * every event is marked `source: "synthetic"` and carries
//     `properties.synthetic = true`, so it can be identified and excluded;
//   * no real personal information is used. Users are `demo_user_0001`.
//     Nothing here is derived from a real person.
//
// The generator is deterministic: the same seed produces byte-identical
// output, which is what makes `scripts/verify-funnel.ts` an assertion
// rather than an observation.
// ============================================================

import { DAY_MS, HOUR_MS, MINUTE_MS } from "./time";

export const SYNTHETIC_SOURCE = "synthetic";

/** The journey every scenario measures. */
export const DEMO_FUNNEL_STEPS = [
  { eventName: "page_view", name: "Landing page" },
  { eventName: "signup", name: "Signed up" },
  { eventName: "login", name: "Logged in" },
  { eventName: "project_created", name: "Created a project" },
  { eventName: "invite_sent", name: "Invited a teammate" },
] as const;

/** Routes each step is emitted from, so path breakdowns mean something. */
const STEP_PATHS: Record<string, string> = {
  page_view: "/",
  signup: "/signup",
  login: "/login",
  project_created: "/projects/new",
  invite_sent: "/projects/team",
};

/** Events emitted alongside the funnel, so the catalog is not just five names. */
const NOISE_EVENTS = [
  { eventName: "page_view", path: "/pricing" },
  { eventName: "page_view", path: "/docs" },
  { eventName: "button_click_docs", path: "/docs" },
  { eventName: "form_submit_event_form", path: "/contact" },
  { eventName: "settings_opened", path: "/settings" },
];

/**
 * Distributions for the dimensions the breakdowns read.
 *
 * Deliberately lopsided — a uniform split makes every breakdown look
 * identical and hides whether the grouping works at all.
 */
const DEVICES: Weighted<{ device: string; os: string; browser: string }>[] = [
  { weight: 52, value: { device: "desktop", os: "Windows", browser: "Chrome" } },
  { weight: 14, value: { device: "desktop", os: "macOS", browser: "Safari" } },
  { weight: 8, value: { device: "desktop", os: "Linux", browser: "Firefox" } },
  { weight: 18, value: { device: "mobile", os: "Android", browser: "Chrome" } },
  { weight: 6, value: { device: "mobile", os: "iOS", browser: "Safari" } },
  { weight: 2, value: { device: "tablet", os: "iOS", browser: "Safari" } },
];

const COUNTRIES: Weighted<string>[] = [
  { weight: 34, value: "IN" },
  { weight: 24, value: "US" },
  { weight: 10, value: "GB" },
  { weight: 8, value: "DE" },
  { weight: 7, value: "BR" },
  { weight: 6, value: "JP" },
  { weight: 5, value: "AU" },
  { weight: 4, value: "CA" },
  { weight: 2, value: "NG" },
];

const REFERRERS: Weighted<string>[] = [
  { weight: 40, value: "" },
  { weight: 22, value: "https://www.google.com" },
  { weight: 14, value: "https://github.com" },
  { weight: 12, value: "https://news.ycombinator.com" },
  { weight: 12, value: "https://x.com" },
];

// ────────────────────────────────────────────────────────────
// Scenario definitions
// ────────────────────────────────────────────────────────────

export interface SyntheticScenario {
  key: string;
  label: string;
  description: string;
  /**
   * Users reaching each step, in order. Must be non-increasing: a step
   * cannot be reached by more users than the step before it.
   */
  stepCounts: number[];
  /** Minutes between consecutive steps. `jitter: 0` makes timings exact. */
  stepDelayMinutes: number[];
  jitterMinutes: number;
  /** How many days of history entries are spread across. */
  spreadDays: number;
  /** Extra non-funnel events per user, on average. */
  noisePerUser: number;
}

export const SCENARIOS: SyntheticScenario[] = [
  {
    key: "controlled-funnel",
    label: "Controlled funnel (known ground truth)",
    description:
      "1000 / 800 / 600 / 350 / 210 users with fixed 10-minute gaps. The funnel must report exactly 21% overall conversion and a 40-minute average time to convert. Used by the verification script.",
    stepCounts: [1000, 800, 600, 350, 210],
    stepDelayMinutes: [0, 10, 10, 10, 10],
    jitterMinutes: 0,
    spreadDays: 14,
    noisePerUser: 0,
  },
  {
    key: "mixed-realistic",
    label: "Mixed realistic traffic",
    description:
      "1000 / 820 / 610 / 340 / 210 users with varied timing, devices, countries and background events. The closest thing to a real project's first month.",
    stepCounts: [1000, 820, 610, 340, 210],
    stepDelayMinutes: [0, 25, 90, 240, 180],
    jitterMinutes: 120,
    spreadDays: 21,
    noisePerUser: 3,
  },
  {
    key: "full-conversion",
    label: "Full conversion",
    description: "Every user completes every step. Proves the engine reports 100% when 100% is true.",
    stepCounts: [400, 400, 400, 400, 400],
    stepDelayMinutes: [0, 5, 15, 30, 20],
    jitterMinutes: 10,
    spreadDays: 7,
    noisePerUser: 1,
  },
  {
    key: "login-dropoff",
    label: "Drop-off at login",
    description: "Signup converts well, then most users never log back in. The largest drop-off must land on signup → login.",
    stepCounts: [800, 720, 260, 210, 180],
    stepDelayMinutes: [0, 15, 720, 60, 45],
    jitterMinutes: 240,
    spreadDays: 14,
    noisePerUser: 2,
  },
  {
    key: "project-dropoff",
    label: "Drop-off at project creation",
    description: "Users sign up and log in, then stall before creating anything. The largest drop-off must land on login → project_created.",
    stepCounts: [800, 700, 640, 190, 160],
    stepDelayMinutes: [0, 12, 40, 300, 60],
    jitterMinutes: 180,
    spreadDays: 14,
    noisePerUser: 2,
  },
  {
    key: "invite-dropoff",
    label: "Drop-off at invite",
    description: "The product is adopted but never shared. The largest drop-off must land on project_created → invite_sent.",
    stepCounts: [800, 690, 620, 560, 120],
    stepDelayMinutes: [0, 12, 45, 90, 600],
    jitterMinutes: 240,
    spreadDays: 14,
    noisePerUser: 2,
  },
];

export function findScenario(key: string): SyntheticScenario | null {
  return SCENARIOS.find((scenario) => scenario.key === key) ?? null;
}

// ────────────────────────────────────────────────────────────
// Generation
// ────────────────────────────────────────────────────────────

/** An ingest payload, identical in shape to what the tracker sends. */
export interface SyntheticPayload {
  projectId: string;
  event: string;
  distinctId: string;
  sessionId: string;
  timestamp: string;
  path: string;
  referrer: string;
  properties: Record<string, string | number | boolean>;
  context: { device: string; browser: string; os: string; country: string };
  source: "synthetic";
}

/** What the funnel engine must report back if the pipeline is correct. */
export interface SyntheticExpectation {
  scenario: string;
  steps: Array<{ eventName: string; users: number }>;
  totalUsers: number;
  convertedUsers: number;
  overallConversionRate: number;
  /** Only meaningful when the scenario has no jitter. */
  averageTimeToConvertMs: number | null;
}

export interface GenerateOptions {
  projectId: string;
  scenario: SyntheticScenario;
  seed?: string;
  /** Latest possible event time. Defaults to now. */
  now?: Date;
  /** Scale every cohort by this factor, for a smaller or larger dataset. */
  scale?: number;
}

export interface GeneratedBatch {
  payloads: SyntheticPayload[];
  expected: SyntheticExpectation;
}

export const MAX_GENERATED_EVENTS = 25_000;

/**
 * Build the full set of payloads for one scenario.
 *
 * Users are assigned to cohorts by index: user `i` reaches every step
 * whose declared count is greater than `i`. Because the counts are
 * non-increasing, that reproduces the declared funnel exactly — the
 * expectation below is a restatement of the input, not a second
 * calculation that could drift from it.
 */
export function generateScenario(options: GenerateOptions): GeneratedBatch {
  const { projectId, scenario } = options;
  const scale = options.scale && options.scale > 0 ? options.scale : 1;
  const random = createRandom(options.seed ?? `${scenario.key}:${projectId}`);
  const endMs = (options.now ?? new Date()).getTime();

  const stepCounts = scenario.stepCounts.map((count) => Math.max(0, Math.round(count * scale)));
  assertNonIncreasing(stepCounts, scenario.key);

  const totalUsers = stepCounts[0] ?? 0;
  const payloads: SyntheticPayload[] = [];

  // The longest possible journey, so no user's final step lands in the future.
  const maxJourneyMs =
    scenario.stepDelayMinutes.reduce((total, minutes) => total + minutes, 0) * MINUTE_MS +
    scenario.jitterMinutes * MINUTE_MS * scenario.stepDelayMinutes.length;
  const windowMs = scenario.spreadDays * DAY_MS;
  const earliestEntryMs = endMs - windowMs;

  for (let index = 0; index < totalUsers; index += 1) {
    const reached = stepCounts.filter((count) => count > index).length;
    if (reached === 0) continue;

    const userId = `demo_user_${String(index + 1).padStart(5, "0")}`;
    const sessionId = `demo_session_${scenario.key}_${String(index + 1).padStart(5, "0")}`;
    const profile = pick(random, DEVICES);
    const country = pick(random, COUNTRIES);
    const referrer = pick(random, REFERRERS);
    const context = { device: profile.device, browser: profile.browser, os: profile.os, country };

    // Entry spread across the window, leaving room for the whole journey.
    const usableWindow = Math.max(HOUR_MS, windowMs - maxJourneyMs);
    const entryMs = earliestEntryMs + Math.floor(random() * usableWindow);

    let cursorMs = entryMs;
    for (let step = 0; step < reached; step += 1) {
      const delayMinutes = scenario.stepDelayMinutes[step] ?? 0;
      const jitter = scenario.jitterMinutes > 0 ? Math.floor(random() * scenario.jitterMinutes) : 0;
      cursorMs += delayMinutes * MINUTE_MS + jitter * MINUTE_MS;

      const eventName = DEMO_FUNNEL_STEPS[step]?.eventName ?? `step_${step + 1}`;
      payloads.push({
        projectId,
        event: eventName,
        distinctId: userId,
        sessionId,
        timestamp: new Date(cursorMs).toISOString(),
        path: STEP_PATHS[eventName] ?? "/",
        referrer: step === 0 ? referrer : "",
        properties: {
          synthetic: true,
          scenario: scenario.key,
          stepIndex: step + 1,
        },
        context,
        source: SYNTHETIC_SOURCE,
      });
    }

    // Background traffic. Never uses a funnel step name, so it cannot
    // change a single number the funnel reports.
    for (let n = 0; n < scenario.noisePerUser; n += 1) {
      if (random() > 0.6) continue;
      const noise = NOISE_EVENTS[Math.floor(random() * NOISE_EVENTS.length)];
      const offsetMs = Math.floor(random() * (cursorMs - entryMs + HOUR_MS));
      payloads.push({
        projectId,
        event: noise.eventName === "page_view" ? "page_view_marketing" : noise.eventName,
        distinctId: userId,
        sessionId,
        timestamp: new Date(entryMs + offsetMs).toISOString(),
        path: noise.path,
        referrer: "",
        properties: { synthetic: true, scenario: scenario.key },
        context,
        source: SYNTHETIC_SOURCE,
      });
    }
  }

  // Chronological order, so the stream a project receives looks like one
  // a real deployment would produce rather than user-by-user batches.
  payloads.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

  return { payloads, expected: describeExpectation(scenario, stepCounts) };
}

/**
 * What the funnel must report for this scenario.
 *
 * Restated directly from the declared cohort sizes. It deliberately does
 * not re-derive anything from the generated payloads: the point of the
 * verification script is to catch a pipeline that loses or reorders
 * events, and an expectation computed from those same events would move
 * with the bug.
 */
function describeExpectation(
  scenario: SyntheticScenario,
  stepCounts: number[]
): SyntheticExpectation {
  const totalUsers = stepCounts[0] ?? 0;
  const convertedUsers = stepCounts[stepCounts.length - 1] ?? 0;
  const totalDelayMinutes = scenario.stepDelayMinutes
    .slice(1, stepCounts.length)
    .reduce((total, minutes) => total + minutes, 0);

  return {
    scenario: scenario.key,
    steps: stepCounts.map((users, index) => ({
      eventName: DEMO_FUNNEL_STEPS[index]?.eventName ?? `step_${index + 1}`,
      users,
    })),
    totalUsers,
    convertedUsers,
    overallConversionRate:
      totalUsers > 0 ? Math.round((convertedUsers / totalUsers) * 1000) / 10 : 0,
    // Only exact when nothing is jittered.
    averageTimeToConvertMs: scenario.jitterMinutes === 0 ? totalDelayMinutes * MINUTE_MS : null,
  };
}

/** The conversion window a scenario's own timings require. */
export function requiredConversionWindowMs(scenario: SyntheticScenario): number {
  const total =
    scenario.stepDelayMinutes.reduce((sum, minutes) => sum + minutes, 0) +
    scenario.jitterMinutes * scenario.stepDelayMinutes.length;
  // Rounded up to whole days, with a day of headroom.
  return Math.max(DAY_MS, Math.ceil((total * MINUTE_MS) / DAY_MS) * DAY_MS + DAY_MS);
}

/** Days of history a scenario needs to be fully visible. */
export function requiredRangeDays(scenario: SyntheticScenario): number {
  return scenario.spreadDays + 1;
}

// ────────────────────────────────────────────────────────────
// Deterministic randomness
// ────────────────────────────────────────────────────────────

interface Weighted<T> {
  weight: number;
  value: T;
}

/** mulberry32 over an FNV-1a seed: small, fast, and identical everywhere. */
export function createRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, options: Weighted<T>[]): T {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let threshold = random() * total;
  for (const option of options) {
    threshold -= option.weight;
    if (threshold <= 0) return option.value;
  }
  return options[options.length - 1].value;
}

function assertNonIncreasing(counts: number[], scenarioKey: string): void {
  for (let index = 1; index < counts.length; index += 1) {
    if (counts[index] > counts[index - 1]) {
      throw new Error(
        `Scenario "${scenarioKey}" declares step ${index + 1} reaching more users than step ${index}, which no funnel can produce.`
      );
    }
  }
}
