// ============================================================
// Aletsch AI — Framework & project-structure detection
// ------------------------------------------------------------
// Pure, deterministic analysis of a repository's manifests and
// directory layout. No LLM, no network, no code execution — the
// repository is treated strictly as untrusted input data.
// ============================================================

export type Framework =
  | "nextjs-app-router"
  | "nextjs-pages-router"
  | "nextjs-hybrid"
  | "react-vite"
  | "react-cra"
  | "remix"
  | "react-router"
  | "react"
  | "nuxt"
  | "vue"
  | "svelte-kit"
  | "svelte"
  | "angular"
  | "astro"
  | "gatsby"
  | "expo"
  | "react-native"
  | "node-backend"
  | "unknown";

export type RouterKind = "app-router" | "pages-router" | "file-based" | "config-based" | "none";

export interface FrameworkDetection {
  framework: Framework;
  /** Display label for the UI. */
  label: string;
  /** 0..1 — how strongly the signals agree. */
  confidence: number;
  language: "typescript" | "javascript" | "mixed" | "unknown";
  routerKind: RouterKind;
  /** Directory the router scans, e.g. "app" or "src/pages". */
  routeRoot: string | null;
  /** True when the project ships a browser bundle we can instrument. */
  isClientRenderable: boolean;
  /** Human-readable evidence, shown in the analysis report. */
  signals: string[];
  /** Detected UI / state / analytics libraries worth reporting. */
  libraries: string[];
  /** Already-present analytics SDKs — instrumentation must not duplicate them. */
  existingAnalytics: string[];
  /** Package manager inferred from lockfiles. */
  packageManager: "npm" | "yarn" | "pnpm" | "bun" | "unknown";
  /** Directory generated instrumentation modules are written into. */
  suggestedTrackerPath: string;
  /** `@/` style alias root when the project configures one. */
  importAlias: string | null;
}

export interface DetectionInput {
  /** Every file path in the repository (blobs only). */
  filePaths: string[];
  /** Raw contents of manifests, keyed by repo-relative path. */
  manifests: Record<string, string>;
}

const ANALYTICS_PACKAGES: Record<string, string> = {
  "posthog-js": "PostHog",
  "posthog-node": "PostHog (server)",
  "@posthog/react": "PostHog",
  "mixpanel-browser": "Mixpanel",
  "@amplitude/analytics-browser": "Amplitude",
  "@segment/analytics-next": "Segment",
  "react-ga4": "Google Analytics",
  "@vercel/analytics": "Vercel Analytics",
  "@sentry/nextjs": "Sentry",
  plausible_tracker: "Plausible",
};

const NOTABLE_LIBRARIES: Record<string, string> = {
  react: "React",
  "react-dom": "React DOM",
  next: "Next.js",
  vue: "Vue",
  svelte: "Svelte",
  "@angular/core": "Angular",
  tailwindcss: "Tailwind CSS",
  "@mui/material": "MUI",
  "@chakra-ui/react": "Chakra UI",
  "@radix-ui/react-dialog": "Radix UI",
  "shadcn-ui": "shadcn/ui",
  "react-hook-form": "React Hook Form",
  formik: "Formik",
  redux: "Redux",
  "@reduxjs/toolkit": "Redux Toolkit",
  zustand: "Zustand",
  jotai: "Jotai",
  "@tanstack/react-query": "TanStack Query",
  swr: "SWR",
  "react-router-dom": "React Router",
  "@clerk/nextjs": "Clerk",
  "next-auth": "NextAuth",
  "@supabase/supabase-js": "Supabase",
  firebase: "Firebase",
  mongoose: "Mongoose",
  prisma: "Prisma",
};

function safeParseJson(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function collectDependencies(pkg: Record<string, unknown> | null): Record<string, string> {
  if (!pkg) return {};
  const merged: Record<string, string> = {};
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const section = pkg[field];
    if (section && typeof section === "object") {
      Object.assign(merged, section as Record<string, string>);
    }
  }
  return merged;
}

/** Finds the manifest whose basename matches, preferring the repo root. */
function findManifest(manifests: Record<string, string>, basename: string): string | undefined {
  if (manifests[basename] !== undefined) return manifests[basename];
  const match = Object.keys(manifests)
    .filter((key) => (key.split("/").pop() ?? key) === basename)
    .sort((a, b) => a.split("/").length - b.split("/").length)[0];
  return match ? manifests[match] : undefined;
}

function detectLanguage(filePaths: string[], deps: Record<string, string>): FrameworkDetection["language"] {
  let ts = 0;
  let js = 0;
  for (const path of filePaths) {
    if (/\.tsx?$/.test(path) && !path.endsWith(".d.ts")) ts++;
    else if (/\.(jsx?|mjs|cjs)$/.test(path)) js++;
  }
  const hasTsConfig = filePaths.some((p) => (p.split("/").pop() ?? p) === "tsconfig.json");
  if (ts === 0 && js === 0) return deps.typescript ? "typescript" : "unknown";
  if (ts > 0 && js > 0) {
    const ratio = ts / (ts + js);
    if (ratio > 0.8) return "typescript";
    if (ratio < 0.2) return "javascript";
    return "mixed";
  }
  if (ts > 0 || hasTsConfig) return "typescript";
  return "javascript";
}

function detectPackageManager(filePaths: string[]): FrameworkDetection["packageManager"] {
  const names = new Set(filePaths.map((p) => p.split("/").pop() ?? p));
  if (names.has("pnpm-lock.yaml")) return "pnpm";
  if (names.has("bun.lockb") || names.has("bun.lock")) return "bun";
  if (names.has("yarn.lock")) return "yarn";
  if (names.has("package-lock.json")) return "npm";
  return "unknown";
}

/** Locates the directory a file-based router scans, if any. */
function findRouteRoot(filePaths: string[], candidates: string[]): string | null {
  for (const candidate of candidates) {
    const prefix = `${candidate}/`;
    if (filePaths.some((p) => p.startsWith(prefix))) return candidate;
  }
  return null;
}

function readImportAlias(manifests: Record<string, string>): string | null {
  for (const name of ["tsconfig.json", "jsconfig.json"]) {
    const parsed = safeParseJson(findManifest(manifests, name));
    const paths = (parsed?.compilerOptions as Record<string, unknown> | undefined)?.paths;
    if (paths && typeof paths === "object") {
      const firstKey = Object.keys(paths)[0];
      if (firstKey) return firstKey.replace(/\*$/, "");
    }
  }
  return null;
}

const FRAMEWORK_LABELS: Record<Framework, string> = {
  "nextjs-app-router": "Next.js (App Router)",
  "nextjs-pages-router": "Next.js (Pages Router)",
  "nextjs-hybrid": "Next.js (App + Pages Router)",
  "react-vite": "React + Vite",
  "react-cra": "React (Create React App)",
  remix: "Remix",
  "react-router": "React + React Router",
  react: "React",
  nuxt: "Nuxt",
  vue: "Vue",
  "svelte-kit": "SvelteKit",
  svelte: "Svelte",
  angular: "Angular",
  astro: "Astro",
  gatsby: "Gatsby",
  expo: "Expo (React Native)",
  "react-native": "React Native",
  "node-backend": "Node.js backend",
  unknown: "Unknown",
};

/**
 * Detects the framework, router style and instrumentation surface of a
 * repository from its manifests and file listing.
 *
 * Deliberately conservative: when signals are weak it returns a low
 * confidence and `unknown` rather than guessing, because downstream
 * instrumentation decisions depend on being right about the router.
 */
export function detectFramework(input: DetectionInput): FrameworkDetection {
  const filePaths = input.filePaths.map((p) => p.replace(/\\/g, "/").replace(/^\.\//, ""));
  const pkg = safeParseJson(findManifest(input.manifests, "package.json"));
  const deps = collectDependencies(pkg);
  const scripts = (pkg?.scripts as Record<string, string> | undefined) ?? {};
  const signals: string[] = [];

  const has = (name: string) => Object.prototype.hasOwnProperty.call(deps, name);
  const fileNames = new Set(filePaths.map((p) => p.split("/").pop() ?? p));
  const hasFile = (basename: string) => fileNames.has(basename);

  const language = detectLanguage(filePaths, deps);
  const packageManager = detectPackageManager(filePaths);
  const importAlias = readImportAlias(input.manifests);

  const libraries = Object.entries(NOTABLE_LIBRARIES)
    .filter(([dep]) => has(dep))
    .map(([, label]) => label);
  const existingAnalytics = Object.entries(ANALYTICS_PACKAGES)
    .filter(([dep]) => has(dep))
    .map(([, label]) => label);

  let framework: Framework = "unknown";
  let confidence = 0.3;
  let routerKind: RouterKind = "none";
  let routeRoot: string | null = null;
  let isClientRenderable = false;

  // ── Next.js ───────────────────────────────────────────────
  if (has("next") || hasFile("next.config.js") || hasFile("next.config.ts") || hasFile("next.config.mjs")) {
    if (has("next")) signals.push(`package.json depends on next@${deps.next}`);
    if (hasFile("next.config.ts") || hasFile("next.config.js") || hasFile("next.config.mjs")) {
      signals.push("next.config.* present");
    }

    const appRoot = findRouteRoot(filePaths, ["app", "src/app"]);
    const pagesRoot = findRouteRoot(filePaths, ["pages", "src/pages"]);
    // An `app/` folder only proves App Router if it holds route files.
    const hasAppRoutes =
      appRoot !== null &&
      filePaths.some((p) => p.startsWith(`${appRoot}/`) && /\/(page|layout|route)\.(t|j)sx?$/.test(p));
    const hasPageRoutes =
      pagesRoot !== null && filePaths.some((p) => p.startsWith(`${pagesRoot}/`) && /\.(t|j)sx?$/.test(p));

    if (hasAppRoutes && hasPageRoutes) {
      framework = "nextjs-hybrid";
      routerKind = "app-router";
      routeRoot = appRoot;
      signals.push(`App Router at ${appRoot}/ and Pages Router at ${pagesRoot}/`);
    } else if (hasAppRoutes) {
      framework = "nextjs-app-router";
      routerKind = "app-router";
      routeRoot = appRoot;
      signals.push(`App Router route files found under ${appRoot}/`);
    } else if (hasPageRoutes) {
      framework = "nextjs-pages-router";
      routerKind = "pages-router";
      routeRoot = pagesRoot;
      signals.push(`Pages Router files found under ${pagesRoot}/`);
    } else {
      framework = "nextjs-app-router";
      routerKind = "app-router";
      signals.push("Next.js detected but no route files were indexed");
    }
    confidence = hasAppRoutes || hasPageRoutes ? 0.97 : 0.7;
    isClientRenderable = true;
  }
  // ── Remix ─────────────────────────────────────────────────
  else if (has("@remix-run/react") || has("@remix-run/node") || hasFile("remix.config.js")) {
    framework = "remix";
    routerKind = "file-based";
    routeRoot = findRouteRoot(filePaths, ["app/routes", "src/routes"]);
    confidence = 0.92;
    isClientRenderable = true;
    signals.push("Remix packages detected");
  }
  // ── Astro ─────────────────────────────────────────────────
  else if (has("astro") || hasFile("astro.config.mjs")) {
    framework = "astro";
    routerKind = "file-based";
    routeRoot = findRouteRoot(filePaths, ["src/pages"]);
    confidence = 0.9;
    isClientRenderable = true;
    signals.push("Astro configuration detected");
  }
  // ── Gatsby ────────────────────────────────────────────────
  else if (has("gatsby")) {
    framework = "gatsby";
    routerKind = "file-based";
    routeRoot = findRouteRoot(filePaths, ["src/pages"]);
    confidence = 0.9;
    isClientRenderable = true;
    signals.push("Gatsby dependency detected");
  }
  // ── Nuxt / Vue ────────────────────────────────────────────
  else if (has("nuxt") || has("nuxt3") || hasFile("nuxt.config.ts") || hasFile("nuxt.config.js")) {
    framework = "nuxt";
    routerKind = "file-based";
    routeRoot = findRouteRoot(filePaths, ["pages", "src/pages"]);
    confidence = 0.9;
    isClientRenderable = true;
    signals.push("Nuxt configuration detected");
  } else if (has("vue")) {
    framework = "vue";
    routerKind = has("vue-router") ? "config-based" : "none";
    confidence = 0.85;
    isClientRenderable = true;
    signals.push("Vue dependency detected");
  }
  // ── SvelteKit / Svelte ────────────────────────────────────
  else if (has("@sveltejs/kit") || hasFile("svelte.config.js")) {
    framework = "svelte-kit";
    routerKind = "file-based";
    routeRoot = findRouteRoot(filePaths, ["src/routes"]);
    confidence = 0.9;
    isClientRenderable = true;
    signals.push("SvelteKit configuration detected");
  } else if (has("svelte")) {
    framework = "svelte";
    confidence = 0.82;
    isClientRenderable = true;
    signals.push("Svelte dependency detected");
  }
  // ── Angular ───────────────────────────────────────────────
  else if (has("@angular/core") || hasFile("angular.json")) {
    framework = "angular";
    routerKind = has("@angular/router") ? "config-based" : "none";
    confidence = 0.92;
    isClientRenderable = true;
    signals.push("Angular workspace detected");
  }
  // ── React Native / Expo ───────────────────────────────────
  else if (has("expo")) {
    framework = "expo";
    routerKind = has("expo-router") ? "file-based" : "config-based";
    routeRoot = findRouteRoot(filePaths, ["app", "src/app"]);
    confidence = 0.9;
    isClientRenderable = true;
    signals.push("Expo dependency detected");
  } else if (has("react-native")) {
    framework = "react-native";
    routerKind = "config-based";
    confidence = 0.88;
    isClientRenderable = true;
    signals.push("React Native dependency detected");
  }
  // ── Plain React variants ──────────────────────────────────
  else if (has("react")) {
    if (has("vite") || hasFile("vite.config.ts") || hasFile("vite.config.js")) {
      framework = "react-vite";
      confidence = 0.9;
      signals.push("Vite build tooling detected alongside React");
    } else if (has("react-scripts")) {
      framework = "react-cra";
      confidence = 0.9;
      signals.push("react-scripts (Create React App) detected");
    } else if (has("react-router-dom")) {
      framework = "react-router";
      confidence = 0.85;
      signals.push("react-router-dom detected");
    } else {
      framework = "react";
      confidence = 0.7;
      signals.push("React dependency detected without a recognised meta-framework");
    }
    routerKind = has("react-router-dom") ? "config-based" : "none";
    isClientRenderable = true;
  }
  // ── Server-only Node project ──────────────────────────────
  else if (has("express") || has("fastify") || has("koa") || has("@nestjs/core")) {
    framework = "node-backend";
    routerKind = "config-based";
    confidence = 0.8;
    isClientRenderable = false;
    signals.push("Server framework detected with no client-side UI packages");
  }

  if (scripts.dev) signals.push(`dev script: ${scripts.dev}`);
  if (existingAnalytics.length > 0) {
    signals.push(`Existing analytics SDK detected: ${existingAnalytics.join(", ")}`);
  }
  if (!pkg) {
    signals.push("No readable package.json — detection relied on directory layout only");
    confidence = Math.min(confidence, 0.45);
  }

  const usesSrc = filePaths.some((p) => p.startsWith("src/"));
  const aliasPrefix = importAlias ?? (usesSrc ? "@/" : "./");
  const trackerDir = usesSrc ? "src/lib" : "lib";

  return {
    framework,
    label: FRAMEWORK_LABELS[framework],
    confidence: Math.round(confidence * 100) / 100,
    language,
    routerKind,
    routeRoot,
    isClientRenderable,
    signals,
    libraries,
    existingAnalytics,
    packageManager,
    // A directory: the tracker, events and provider modules are all
    // written inside it (see lib/instrumentation/tracker-template.ts).
    suggestedTrackerPath: `${trackerDir}/aletsch`,
    importAlias: aliasPrefix === "./" ? null : aliasPrefix,
  };
}

/**
 * Summarises the app's structure for the analysis report: how many
 * routes, which are dynamic, and where the interactive surface lives.
 */
export interface AppStructure {
  totalFiles: number;
  routeCount: number;
  dynamicRouteCount: number;
  apiRouteCount: number;
  componentDirectories: string[];
  topLevelDirectories: string[];
}

export function analyzeAppStructure(filePaths: string[], routes: string[]): AppStructure {
  const normalised = filePaths.map((p) => p.replace(/\\/g, "/"));
  const dirs = new Set<string>();
  const componentDirs = new Set<string>();

  for (const path of normalised) {
    const segments = path.split("/");
    if (segments.length > 1) dirs.add(segments[0]);
    const dir = segments.slice(0, -1).join("/");
    if (/(components?|ui|views?|screens?|features?|widgets?|forms?)$/i.test(dir)) {
      componentDirs.add(dir);
    }
  }

  return {
    totalFiles: normalised.length,
    routeCount: routes.length,
    dynamicRouteCount: routes.filter((r) => r.includes("[") || r.includes(":")).length,
    apiRouteCount: normalised.filter((p) => /(^|\/)(api)\//.test(p) && /route\.(t|j)sx?$/.test(p)).length,
    componentDirectories: Array.from(componentDirs).sort(),
    topLevelDirectories: Array.from(dirs).sort(),
  };
}
