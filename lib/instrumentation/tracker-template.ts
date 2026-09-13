// ============================================================
// Aletsch AI — Generated tracker templates
// ------------------------------------------------------------
// Produces the analytics runtime that Aletsch writes *into the user's
// repository*. Everything here is a pure string builder: it renders
// source code, it does not execute anything.
//
// Design rules for the generated code:
//   • It must be readable. A developer reviewing the PR should be able
//     to understand and delete it without archaeology.
//   • It must degrade to a no-op when unconfigured, never throw, and
//     never block a click handler.
//   • It must not capture input values, form contents, or query
//     strings — only that an action occurred.
// ============================================================

import type { FrameworkDetection } from "@/lib/ingestion/framework-detector";
import type { EventCatalog, GeneratedEvent } from "@/lib/events/event-plan";

export interface GeneratedFile {
  path: string;
  content: string;
  /** Shown in the review UI above the diff. */
  purpose: string;
  isNew: boolean;
}

export interface TrackerOptions {
  framework: FrameworkDetection;
  /** Absolute origin of this Aletsch deployment, e.g. https://aletsch.example.com */
  ingestOrigin: string;
  projectId: string;
  /** Emit PostHog wiring and add the dependency if missing. */
  includePostHog: boolean;
  /** posthog-js is already a dependency of the target repo. */
  postHogAlreadyInstalled: boolean;
}

// ────────────────────────────────────────────────────────────
// Environment variables
// ────────────────────────────────────────────────────────────

/**
 * Bundlers only inline environment variables that carry the framework's
 * public prefix. Getting this wrong means the tracker silently reads
 * `undefined` in the browser, so it is derived in exactly one place.
 */
export function publicEnvPrefix(framework: FrameworkDetection): string {
  switch (framework.framework) {
    case "nextjs-app-router":
    case "nextjs-pages-router":
    case "nextjs-hybrid":
      return "NEXT_PUBLIC_";
    case "react-vite":
    case "svelte-kit":
    case "astro":
      return "VITE_";
    case "react-cra":
    case "gatsby":
      return "REACT_APP_";
    case "nuxt":
      return "NUXT_PUBLIC_";
    case "expo":
      return "EXPO_PUBLIC_";
    default:
      return "PUBLIC_";
  }
}

/** Whether the framework exposes env vars via `import.meta.env`. */
function usesImportMeta(framework: FrameworkDetection): boolean {
  return framework.framework === "react-vite" || framework.framework === "svelte-kit" || framework.framework === "astro";
}

export function envVarName(framework: FrameworkDetection, suffix: string): string {
  return `${publicEnvPrefix(framework)}${suffix}`;
}

/** Source expression that reads a public env var at build time. */
function envExpression(framework: FrameworkDetection, suffix: string, ts: boolean): string {
  const name = envVarName(framework, suffix);
  if (usesImportMeta(framework)) {
    return ts ? `(import.meta as any).env?.${name}` : `import.meta.env?.${name}`;
  }
  return `process.env.${name}`;
}

function devExpression(framework: FrameworkDetection, ts: boolean): string {
  if (usesImportMeta(framework)) {
    return ts ? `(import.meta as any).env?.DEV` : `import.meta.env?.DEV`;
  }
  return `process.env.NODE_ENV !== "production"`;
}

// ────────────────────────────────────────────────────────────
// Paths
// ────────────────────────────────────────────────────────────

export function trackerModulePath(framework: FrameworkDetection): string {
  const extension = framework.language === "typescript" ? "ts" : "js";
  return `${framework.suggestedTrackerPath}/analytics.${extension}`;
}

export function eventsModulePath(framework: FrameworkDetection): string {
  const extension = framework.language === "typescript" ? "ts" : "js";
  return `${framework.suggestedTrackerPath}/events.${extension}`;
}

export function providerComponentPath(framework: FrameworkDetection): string {
  const extension = framework.language === "typescript" ? "tsx" : "jsx";
  return `${framework.suggestedTrackerPath}/AletschAnalytics.${extension}`;
}

/**
 * Computes a relative import specifier between two repo-relative paths.
 *
 * Relative specifiers are used everywhere rather than the project's
 * `@/` alias: they resolve identically under every bundler and
 * tsconfig, so generated imports cannot break on a paths mapping we
 * guessed wrong.
 */
export function relativeSpecifier(fromFile: string, toModule: string): string {
  const fromParts = fromFile.split("/").slice(0, -1);
  const toParts = toModule.split("/");

  let shared = 0;
  while (shared < fromParts.length && shared < toParts.length - 1 && fromParts[shared] === toParts[shared]) {
    shared++;
  }

  const up = fromParts.length - shared;
  const prefix = up === 0 ? "./" : "../".repeat(up);
  return `${prefix}${toParts.slice(shared).join("/")}`;
}

/** Import specifier an instrumented file uses to reach the tracker. */
export function trackerImportSpecifier(framework: FrameworkDetection, fromFilePath: string): string {
  return relativeSpecifier(fromFilePath, stripExtension(trackerModulePath(framework)));
}

export function eventsImportSpecifier(framework: FrameworkDetection, fromFilePath: string): string {
  return relativeSpecifier(fromFilePath, stripExtension(eventsModulePath(framework)));
}

function stripExtension(path: string): string {
  return path.replace(/\.(tsx?|jsx?)$/, "");
}

const BANNER = `/**
 * Generated by Aletsch AI — auto-instrumented product analytics.
 *
 * Safe to edit by hand. Re-running instrumentation shows you a diff
 * before overwriting anything. To remove Aletsch entirely, delete this
 * file and the track calls that import it.
 */`;

// ────────────────────────────────────────────────────────────
// Core tracker module
// ────────────────────────────────────────────────────────────

export function renderTrackerModule(options: TrackerOptions): string {
  const ts = options.framework.language === "typescript";

  const types = ts
    ? `
export interface TrackProperties {
  [key: string]: string | number | boolean | null | undefined;
}

type Handler = (...args: any[]) => any;
`
    : "";

  const windowAny = ts ? "(window as any)" : "window";

  const postHogCapture = options.includePostHog
    ? `
  try {
    const posthog = ${windowAny}.posthog;
    if (posthog && typeof posthog.capture === "function") {
      posthog.capture(eventName, properties);
    }
  } catch (error) {
    /* a broken analytics vendor must not break the app */
  }
`
    : "";

  const postHogIdentify = options.includePostHog
    ? `
  try {
    const posthog = ${windowAny}.posthog;
    if (posthog && typeof posthog.identify === "function") {
      posthog.identify(userId, traits || {});
    }
  } catch (error) {
    /* ignore */
  }
`
    : "";

  return `${BANNER}

const PROJECT_ID = ${JSON.stringify(options.projectId)};
const INGEST_URL = ${JSON.stringify(`${options.ingestOrigin.replace(/\/+$/, "")}/api/ingest`)};

/**
 * Publishable write key. Like a PostHog project key, this is safe in a
 * client bundle: it can only append events to this one project, and
 * can never read them back.
 */
const WRITE_KEY = ${envExpression(options.framework, "ALETSCH_WRITE_KEY", ts)} || "";

const SESSION_KEY = "aletsch.session";
const DISTINCT_ID_KEY = "aletsch.distinct_id";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
${types}
function isBrowser()${ts ? ": boolean" : ""} {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function randomId()${ts ? ": string" : ""} {
  if (isBrowser() && window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * A session is a run of activity with no 30-minute gap. Held in
 * sessionStorage, so it never outlives the tab and sets no cookie.
 */
function getSessionId()${ts ? ": string" : ""} {
  if (!isBrowser()) return "server";
  try {
    const now = Date.now();
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id && now - parsed.at < SESSION_TIMEOUT_MS) {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: parsed.id, at: now }));
        return parsed.id;
      }
    }
    const id = randomId();
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: id, at: now }));
    return id;
  } catch (error) {
    return "unavailable";
  }
}

/** Anonymous and per-browser until identify() supplies a real user id. */
function getDistinctId()${ts ? ": string" : ""} {
  if (!isBrowser()) return "server";
  try {
    let id = window.localStorage.getItem(DISTINCT_ID_KEY);
    if (!id) {
      id = "anon_" + randomId();
      window.localStorage.setItem(DISTINCT_ID_KEY, id);
    }
    return id;
  } catch (error) {
    return "anon_ephemeral";
  }
}

/** Associates subsequent events with your own user identifier. */
export function identify(userId${ts ? ": string" : ""}, traits${ts ? "?: TrackProperties" : ""}) {
  if (!isBrowser() || !userId) return;
  try {
    window.localStorage.setItem(DISTINCT_ID_KEY, userId);
  } catch (error) {
    /* storage disabled — events still send with the ephemeral id */
  }
${postHogIdentify}}

function send(eventName${ts ? ": string" : ""}, properties${ts ? ": TrackProperties" : ""}) {
  if (!isBrowser()) return;

  const payload = {
    projectId: PROJECT_ID,
    writeKey: WRITE_KEY,
    event: eventName,
    distinctId: getDistinctId(),
    sessionId: getSessionId(),
    timestamp: new Date().toISOString(),
    // Path only. Query strings routinely carry tokens, emails and other
    // personal data, so they are dropped before the event leaves.
    path: window.location.pathname,
    referrer: document.referrer || "",
    properties: properties,
  };

  try {
    const body = JSON.stringify(payload);
    // sendBeacon survives page unload, which plain fetch does not —
    // that matters for navigation and form-submit events.
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(INGEST_URL, blob)) return;
    }
    fetch(INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
      keepalive: true,
    }).catch(function () {
      /* analytics must never surface an error to the user */
    });
  } catch (error) {
    /* ignore */
  }
}

/** Records that something happened. Never throws, never blocks. */
export function track(eventName${ts ? ": string" : ""}, properties${ts ? ": TrackProperties = {}" : " = {}"}) {
  if (!eventName || !isBrowser()) return;
${postHogCapture}
  if (WRITE_KEY) {
    send(eventName, properties);
    return;
  }

  if (${devExpression(options.framework, ts)}) {
    console.warn(
      "[aletsch] '" + eventName + "' was not sent: ${envVarName(options.framework, "ALETSCH_WRITE_KEY")} is not set."
    );
  }
}

/**
 * Wraps an existing handler so the event fires *and* the original
 * handler runs unchanged — same arguments, same \`this\`, same return
 * value, same async behaviour. With no handler it returns a
 * tracking-only handler.
 *
 *   onClick={trackEvent("checkout_started", { plan: "pro" }, handleCheckout)}
 */
export function trackEvent(
  eventName${ts ? ": string" : ""},
  properties${ts ? ": TrackProperties = {}" : " = {}"},
  handler${ts ? "?: Handler" : ""}
)${ts ? ": Handler" : ""} {
  return function (${ts ? "...args: any[]" : "...args"}) {
    track(eventName, properties);
    if (typeof handler === "function") {
      ${ts ? "return handler.apply(this as any, args);" : "return handler.apply(this, args);"}
    }
    return undefined;
  };
}

/** Records a page or screen view. */
export function trackPageView(path${ts ? "?: string" : ""}, properties${ts ? ": TrackProperties = {}" : " = {}"}) {
  const resolved = path || (isBrowser() ? window.location.pathname : "");
  track("page_viewed", Object.assign({ path: resolved }, properties));
}
`;
}

// ────────────────────────────────────────────────────────────
// Typed event constants
// ────────────────────────────────────────────────────────────

/**
 * A module of named constants for every approved event. Typos in event
 * names are the most common way analytics data rots, so generated call
 * sites reference these instead of bare string literals.
 */
export function renderEventsModule(catalog: EventCatalog, selected: GeneratedEvent[], ts: boolean): string {
  const entries = selected
    .map((event) => {
      const constant = event.eventName.toUpperCase();
      const stage = event.funnelStage !== "unknown" ? ` (${event.funnelStage})` : "";
      return `  /** ${escapeComment(event.description)}${stage} */\n  ${constant}: ${JSON.stringify(event.eventName)},`;
    })
    .join("\n");

  return `${BANNER}

/**
 * ${selected.length} event${selected.length === 1 ? "" : "s"} derived from static analysis of this repository
 * on ${catalog.generatedAt.slice(0, 10)}.
 */
export const ALETSCH_EVENTS = {
${entries || "  /* No events were approved. */"}
}${ts ? " as const" : ""};
${ts ? "\nexport type AletschEventName = (typeof ALETSCH_EVENTS)[keyof typeof ALETSCH_EVENTS];\n" : ""}`;
}

function escapeComment(text: string): string {
  return text.replace(/\*\//g, "* /").replace(/[\r\n]+/g, " ").slice(0, 160);
}

// ────────────────────────────────────────────────────────────
// React provider (pageviews + PostHog bootstrap)
// ────────────────────────────────────────────────────────────

export function renderProviderComponent(options: TrackerOptions): string {
  const { framework } = options;
  const ts = framework.language === "typescript";
  const windowAny = ts ? "(window as any)" : "window";
  const trackerImport = relativeSpecifier(providerComponentPath(framework), stripExtension(trackerModulePath(framework)));

  const postHogImport = options.includePostHog ? `import posthog from "posthog-js";\n` : "";
  const postHogInit = options.includePostHog
    ? `
    const key = ${envExpression(framework, "POSTHOG_KEY", ts)};
    if (key && !${windowAny}.posthog) {
      posthog.init(key, {
        api_host: ${envExpression(framework, "POSTHOG_HOST", ts)} || "https://us.i.posthog.com",
        // Aletsch emits its own page_viewed event on route change, which
        // client-side routers do not trigger a reload for.
        capture_pageview: false,
        person_profiles: "identified_only",
      });
      ${windowAny}.posthog = posthog;
    }
`
    : "\n    /* PostHog is not enabled for this project. */\n";

  if (framework.framework === "nextjs-app-router" || framework.framework === "nextjs-hybrid") {
    return `"use client";

${BANNER}

import { useEffect } from "react";
import { usePathname } from "next/navigation";
${postHogImport}import { trackPageView } from "${trackerImport}";

export default function AletschAnalytics() {
  const pathname = usePathname();

  useEffect(() => {${postHogInit}  }, []);

  useEffect(() => {
    if (!pathname) return;
    trackPageView(pathname);
  }, [pathname]);

  return null;
}
`;
  }

  if (framework.framework === "nextjs-pages-router") {
    return `${BANNER}

import { useEffect } from "react";
import { useRouter } from "next/router";
${postHogImport}import { trackPageView } from "${trackerImport}";

export default function AletschAnalytics() {
  const router = useRouter();

  useEffect(() => {${postHogInit}  }, []);

  useEffect(() => {
    const handleRouteChange = (url${ts ? ": string" : ""}) => trackPageView(url.split("?")[0]);
    trackPageView(router.asPath.split("?")[0]);
    router.events.on("routeChangeComplete", handleRouteChange);
    return () => router.events.off("routeChangeComplete", handleRouteChange);
  }, [router]);

  return null;
}
`;
  }

  // Generic React (Vite / CRA / Remix / Gatsby): observe history
  // directly so this file stays independent of the router in use.
  return `${BANNER}

import { useEffect } from "react";
${postHogImport}import { trackPageView } from "${trackerImport}";

export default function AletschAnalytics() {
  useEffect(() => {${postHogInit}
    let lastPath = window.location.pathname;
    const report = () => {
      const path = window.location.pathname;
      if (path === lastPath) return;
      lastPath = path;
      trackPageView(path);
    };

    trackPageView(lastPath);

    const originalPush = history.pushState;
    const originalReplace = history.replaceState;
    history.pushState = function (${ts ? "...args: any[]" : "...args"}) {
      originalPush.apply(this, args);
      report();
    };
    history.replaceState = function (${ts ? "...args: any[]" : "...args"}) {
      originalReplace.apply(this, args);
      report();
    };
    window.addEventListener("popstate", report);

    return () => {
      history.pushState = originalPush;
      history.replaceState = originalReplace;
      window.removeEventListener("popstate", report);
    };
  }, []);

  return null;
}
`;
}

// ────────────────────────────────────────────────────────────
// Setup notes for the pull request body
// ────────────────────────────────────────────────────────────

export function renderSetupInstructions(options: TrackerOptions, writeKey: string | null): string {
  const writeKeyVar = envVarName(options.framework, "ALETSCH_WRITE_KEY");
  const postHogKeyVar = envVarName(options.framework, "POSTHOG_KEY");
  const postHogHostVar = envVarName(options.framework, "POSTHOG_HOST");

  const lines = [
    "### Setup",
    "",
    "Add these to your environment (`.env.local`, or your host's dashboard):",
    "",
    "```bash",
    `${writeKeyVar}=${writeKey ?? "<your Aletsch write key>"}`,
  ];

  if (options.includePostHog) {
    lines.push(`${postHogKeyVar}=<your PostHog project API key>`);
    lines.push(`${postHogHostVar}=https://us.i.posthog.com`);
  }

  lines.push("```", "");

  if (options.includePostHog && !options.postHogAlreadyInstalled) {
    lines.push(
      "This pull request adds `posthog-js` to `package.json`. Install before running:",
      "",
      "```bash",
      installCommand(options.framework.packageManager),
      "```",
      ""
    );
  }

  lines.push(
    "Both keys are optional at runtime. Without them the tracker is a no-op and the app behaves exactly as it did before.",
    "",
    "**No user input is captured.** Aletsch records that an interaction happened, plus the component, route, element and visible label. Field values, form contents and URL query strings are never sent."
  );

  return lines.join("\n");
}

function installCommand(packageManager: string): string {
  switch (packageManager) {
    case "pnpm":
      return "pnpm install";
    case "yarn":
      return "yarn install";
    case "bun":
      return "bun install";
    default:
      return "npm install";
  }
}
