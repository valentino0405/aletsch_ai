// ============================================================
// Aletsch AI — Repository file filter
// ------------------------------------------------------------
// Single source of truth for "which files does Aletsch read?".
// Previously this logic was duplicated across three API routes and
// the analysis runner, which let them drift apart; every caller now
// imports from here.
// ============================================================

import { isSensitivePath } from "@/lib/security/secret-filter";

/** Source extensions the AST engine can parse. */
export const ANALYZABLE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"] as const;

/** Config/manifest files read for framework detection (never AST-parsed). */
export const MANIFEST_FILES = [
  "package.json",
  "tsconfig.json",
  "jsconfig.json",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "vite.config.js",
  "vite.config.ts",
  "svelte.config.js",
  "nuxt.config.js",
  "nuxt.config.ts",
  "remix.config.js",
  "angular.json",
  "vue.config.js",
  "astro.config.mjs",
  "gatsby-config.js",
  "app.json",
  "expo.json",
] as const;

/** Directory or filename fragments that are never worth analysing. */
const SKIP_FRAGMENTS = [
  "node_modules/",
  ".next/",
  ".nuxt/",
  ".svelte-kit/",
  ".turbo/",
  ".vercel/",
  ".git/",
  "dist/",
  "build/",
  "out/",
  "coverage/",
  "storybook-static/",
  "__tests__/",
  "__mocks__/",
  "__snapshots__/",
  "/vendor/",
  ".test.",
  ".spec.",
  ".stories.",
  ".min.js",
  ".bundle.js",
  ".d.ts",
  "/generated/",
];

/** Maximum bytes we will download for a single file. */
export const MAX_FILE_BYTES = 400_000;

export function fileExtension(filePath: string): string {
  const base = filePath.split("/").pop() ?? filePath;
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot).toLowerCase();
}

/** Normalises Windows separators and strips a leading "./". */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

export type SkipReason =
  | "sensitive"
  | "ignored_directory"
  | "unsupported_extension"
  | null;

/**
 * Explains why a file will not be analysed, or returns `null` when it
 * will be. Returning the reason (rather than a bare boolean) lets the
 * analysis report tell the developer what was skipped and why.
 */
export function skipReason(filePath: string): SkipReason {
  const path = normalizePath(filePath);

  // Security first: a sensitive path is excluded even if it looks like source.
  if (isSensitivePath(path)) return "sensitive";
  if (SKIP_FRAGMENTS.some((fragment) => path.includes(fragment))) return "ignored_directory";
  if (!ANALYZABLE_EXTENSIONS.includes(fileExtension(path) as (typeof ANALYZABLE_EXTENSIONS)[number])) {
    return "unsupported_extension";
  }
  return null;
}

/** True when the AST engine should parse this file. */
export function shouldAnalyzeFile(filePath: string): boolean {
  return skipReason(filePath) === null;
}

/** True when the file is a manifest we read for framework detection. */
export function isManifestFile(filePath: string): boolean {
  const path = normalizePath(filePath);
  if (isSensitivePath(path)) return false;
  if (path.includes("node_modules/")) return false;
  const base = path.split("/").pop() ?? path;
  return (MANIFEST_FILES as readonly string[]).includes(base);
}

/**
 * True when a repository file should be indexed at all — i.e. it is
 * either analysable source or a manifest worth reading.
 */
export function shouldIndexFile(filePath: string): boolean {
  return shouldAnalyzeFile(filePath) || isManifestFile(filePath);
}

export interface RepoTreeEntry {
  path: string;
  type: "blob" | "tree";
}

export interface FilterSummary<T extends RepoTreeEntry> {
  analyzable: T[];
  manifests: T[];
  skipped: Array<{ path: string; reason: Exclude<SkipReason, null> }>;
  /** Number of files excluded specifically because they looked sensitive. */
  sensitiveExcluded: number;
}

/**
 * Partitions a GitHub tree listing into the buckets the ingestion
 * pipeline needs, and records what was dropped.
 */
export function partitionRepoTree<T extends RepoTreeEntry>(entries: T[]): FilterSummary<T> {
  const analyzable: T[] = [];
  const manifests: T[] = [];
  const skipped: Array<{ path: string; reason: Exclude<SkipReason, null> }> = [];
  let sensitiveExcluded = 0;

  for (const entry of entries) {
    if (entry.type !== "blob") continue;

    if (isManifestFile(entry.path)) {
      manifests.push(entry);
      continue;
    }

    const reason = skipReason(entry.path);
    if (reason === null) {
      analyzable.push(entry);
    } else {
      if (reason === "sensitive") sensitiveExcluded++;
      // Unsupported extensions are the overwhelming majority (images,
      // lockfiles, markdown); recording each one would bloat the report.
      if (reason !== "unsupported_extension") skipped.push({ path: entry.path, reason });
    }
  }

  return { analyzable, manifests, skipped, sensitiveExcluded };
}

/**
 * Orders files so the most behaviourally interesting ones are analysed
 * first. This matters because analysis is capped (GitHub rate limits):
 * with a 120-file budget on a 900-file repo we want the pages and
 * interactive components, not utility modules.
 */
export function prioritizeForAnalysis<T extends RepoTreeEntry>(entries: T[]): T[] {
  const score = (path: string): number => {
    const p = normalizePath(path).toLowerCase();
    let value = 0;
    if (/(^|\/)(app|pages|src\/app|src\/pages)\//.test(p)) value += 50;
    if (/\/(page|route|layout)\.(t|j)sx?$/.test(p)) value += 40;
    if (/(^|\/)(components?|ui|views?|screens?|features?|forms?)\//.test(p)) value += 30;
    if (p.endsWith(".tsx") || p.endsWith(".jsx")) value += 20;
    if (/(^|\/)(lib|utils?|helpers?|config|constants?|types?|hooks?)\//.test(p)) value -= 15;
    // Prefer shallower files; deeply nested ones are usually leaf utilities.
    value -= (p.split("/").length - 1) * 2;
    return value;
  };

  return [...entries].sort((a, b) => {
    const diff = score(b.path) - score(a.path);
    return diff !== 0 ? diff : a.path.localeCompare(b.path);
  });
}
