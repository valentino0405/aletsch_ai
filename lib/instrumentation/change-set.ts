// ============================================================
// Aletsch AI — Change set builder
// ------------------------------------------------------------
// Turns an approved event catalog into a concrete, reviewable set of
// file changes: generated tracker modules plus AST-rewritten source
// files, each with a unified diff and a validation verdict.
//
// Source content is read through an injected `readFile`, never touched
// directly, and the result is deliberately *not* persisted: the change
// set is recomputed from the repository each time it is previewed or
// applied, so Aletsch never stores a copy of private source code.
// ============================================================

import type { EventCatalog, GeneratedEvent } from "@/lib/events/event-plan";
import type { FrameworkDetection } from "@/lib/ingestion/framework-detector";
import { createFileDiff, summarizeDiffs, type FileDiff } from "./diff";
import {
  instrumentFile,
  injectProvider,
  type AppliedEdit,
  type InstrumentationTarget,
  type SkippedEdit,
} from "./codemod";
import {
  eventsModulePath,
  providerComponentPath,
  relativeSpecifier,
  renderEventsModule,
  renderProviderComponent,
  renderSetupInstructions,
  renderTrackerModule,
  trackerModulePath,
  type TrackerOptions,
} from "./tracker-template";
import { validateChangeSet, validateGeneratedFile, type ValidationReport } from "./validator";

export interface ChangeSetFile {
  path: string;
  purpose: string;
  isNew: boolean;
  /** Post-change content. Returned to the reviewer, never persisted. */
  content: string;
  diff: FileDiff;
  applied: AppliedEdit[];
  skipped: SkippedEdit[];
}

export interface ChangeSetWarning {
  code: string;
  message: string;
  path?: string;
}

export interface ChangeSet {
  files: ChangeSetFile[];
  validation: ValidationReport;
  summary: {
    filesChanged: number;
    filesCreated: number;
    additions: number;
    deletions: number;
    eventsInstrumented: number;
    eventsSkipped: number;
  };
  warnings: ChangeSetWarning[];
  setupInstructions: string;
  /** Empty when the catalog produced no applicable change. */
  isEmpty: boolean;
}

export interface BuildChangeSetOptions {
  framework: FrameworkDetection;
  catalog: EventCatalog;
  /** Event names the developer ticked. Nothing else is instrumented. */
  approvedEventNames: string[];
  projectId: string;
  ingestOrigin: string;
  includePostHog: boolean;
  writeKey: string | null;
  /** Reads a repo file. Returns null when the file does not exist. */
  readFile: (path: string) => Promise<string | null>;
  /** Every path in the repository, used to locate the root layout. */
  repoFilePaths: string[];
}

/** Locates the root layout / app entry point to mount the provider in. */
export function findLayoutPath(framework: FrameworkDetection, repoFilePaths: string[]): string | null {
  const candidates: string[] = [];

  switch (framework.framework) {
    case "nextjs-app-router":
    case "nextjs-hybrid":
      candidates.push("app/layout.tsx", "app/layout.jsx", "src/app/layout.tsx", "src/app/layout.jsx");
      break;
    case "nextjs-pages-router":
      candidates.push("pages/_app.tsx", "pages/_app.jsx", "src/pages/_app.tsx", "src/pages/_app.jsx");
      break;
    case "remix":
      candidates.push("app/root.tsx", "app/root.jsx");
      break;
    default:
      candidates.push(
        "src/App.tsx",
        "src/App.jsx",
        "src/main.tsx",
        "src/main.jsx",
        "src/index.tsx",
        "src/index.jsx"
      );
      break;
  }

  const available = new Set(repoFilePaths);
  return candidates.find((candidate) => available.has(candidate)) ?? null;
}

/** Converts approved catalog events into per-file codemod targets. */
function buildTargets(events: GeneratedEvent[]): Map<string, InstrumentationTarget[]> {
  const byFile = new Map<string, InstrumentationTarget[]>();

  for (const event of events) {
    for (const site of event.sites) {
      const properties: Record<string, string> = {};
      for (const property of event.properties) {
        // Constants are pinned per event; multi-site events fall back to
        // the values of the site being instrumented.
        if (property.constant) {
          properties[property.name] = property.constant;
          continue;
        }
        if (property.name === "component") properties.component = site.componentName;
        if (property.name === "route") properties.route = site.route;
        if (property.name === "element") properties.element = site.tagName;
        if (property.name === "label") properties.label = site.label;
        if (property.name === "destination") {
          properties.destination = String(site.metadata?.href ?? site.metadata?.target ?? "");
        }
        if (property.name === "form") properties.form = site.componentName;
      }

      const list = byFile.get(site.filePath) ?? [];
      list.push({
        eventName: event.eventName,
        lineNumber: site.lineNumber,
        tagName: site.tagName,
        interactionType: site.interactionType,
        componentName: site.componentName,
        label: site.label,
        properties,
      });
      byFile.set(site.filePath, list);
    }
  }

  return byFile;
}

/** Adds `posthog-js` to package.json, preserving formatting and order. */
export function addPostHogDependency(packageJsonText: string): { content: string; changed: boolean } {
  try {
    const parsed = JSON.parse(packageJsonText);
    if (parsed.dependencies?.["posthog-js"] || parsed.devDependencies?.["posthog-js"]) {
      return { content: packageJsonText, changed: false };
    }

    parsed.dependencies = parsed.dependencies ?? {};
    parsed.dependencies["posthog-js"] = "^1.297.0";
    parsed.dependencies = Object.fromEntries(
      Object.entries(parsed.dependencies).sort(([a], [b]) => a.localeCompare(b))
    );

    // Match the file's existing indentation so the diff stays minimal.
    const indentMatch = packageJsonText.match(/\n(\s+)"/);
    const indent = indentMatch ? indentMatch[1].length : 2;
    const trailingNewline = packageJsonText.endsWith("\n") ? "\n" : "";

    return { content: `${JSON.stringify(parsed, null, indent)}${trailingNewline}`, changed: true };
  } catch {
    return { content: packageJsonText, changed: false };
  }
}

/**
 * Produces the full change set for an approved catalog.
 *
 * Every file is validated before it is returned. A change set with any
 * validation error must not be applied — the API layer enforces that.
 */
export async function buildChangeSet(options: BuildChangeSetOptions): Promise<ChangeSet> {
  const { framework, catalog, approvedEventNames, repoFilePaths } = options;
  const approved = new Set(approvedEventNames);
  const events = catalog.events.filter((event) => approved.has(event.eventName));

  const files: ChangeSetFile[] = [];
  const warnings: ChangeSetWarning[] = [];
  const instrumentationResults = [];

  const trackerOptions: TrackerOptions = {
    framework,
    ingestOrigin: options.ingestOrigin,
    projectId: options.projectId,
    includePostHog: options.includePostHog,
    postHogAlreadyInstalled: framework.existingAnalytics.some((label) => label.startsWith("PostHog")),
  };

  if (events.length === 0) {
    return {
      files: [],
      validation: { valid: true, files: [], errorCount: 0, warningCount: 0 },
      summary: {
        filesChanged: 0,
        filesCreated: 0,
        additions: 0,
        deletions: 0,
        eventsInstrumented: 0,
        eventsSkipped: 0,
      },
      warnings: [{ code: "no_events_approved", message: "No events were approved, so there is nothing to apply." }],
      setupInstructions: renderSetupInstructions(trackerOptions, options.writeKey),
      isEmpty: true,
    };
  }

  // ── 1. Generated runtime files ─────────────────────────────

  const generated: { path: string; content: string; purpose: string }[] = [
    {
      path: trackerModulePath(framework),
      content: renderTrackerModule(trackerOptions),
      purpose: "Analytics runtime: session handling, event delivery, and the trackEvent handler wrapper.",
    },
    {
      path: eventsModulePath(framework),
      content: renderEventsModule(catalog, events, framework.language === "typescript"),
      purpose: `Named constants for the ${events.length} approved event${events.length === 1 ? "" : "s"}.`,
    },
    {
      path: providerComponentPath(framework),
      content: renderProviderComponent(trackerOptions),
      purpose: "Client component that records page views on route change and boots PostHog.",
    },
  ];

  for (const file of generated) {
    const existing = await options.readFile(file.path);
    files.push({
      path: file.path,
      purpose: file.purpose,
      isNew: existing === null,
      content: file.content,
      diff: createFileDiff(existing ?? "", file.content, { filePath: file.path, isNewFile: existing === null }),
      applied: [],
      skipped: [],
    });
  }

  // ── 2. Instrumented source files ───────────────────────────

  const targetsByFile = buildTargets(events);
  let eventsInstrumented = 0;
  let eventsSkipped = 0;

  for (const [filePath, targets] of targetsByFile) {
    const original = await options.readFile(filePath);
    if (original === null) {
      warnings.push({
        code: "file_unreadable",
        message: `${filePath} could not be read from the repository and was left alone.`,
        path: filePath,
      });
      eventsSkipped += targets.length;
      continue;
    }

    const result = instrumentFile(filePath, original, targets, { framework });
    instrumentationResults.push(result);
    eventsInstrumented += result.applied.length;
    eventsSkipped += result.skipped.length;

    if (result.error) {
      warnings.push({ code: "codemod_error", message: result.error, path: filePath });
      continue;
    }
    if (result.unchanged) continue;

    files.push({
      path: filePath,
      purpose: `Emits ${result.applied.length} event${result.applied.length === 1 ? "" : "s"}.`,
      isNew: false,
      content: result.instrumentedContent,
      diff: createFileDiff(original, result.instrumentedContent, { filePath }),
      applied: result.applied,
      skipped: result.skipped,
    });
  }

  // ── 3. Mount the provider ──────────────────────────────────

  const layoutPath = findLayoutPath(framework, repoFilePaths);
  if (layoutPath) {
    const layoutContent = await options.readFile(layoutPath);
    if (layoutContent !== null) {
      const specifier = relativeSpecifier(layoutPath, providerComponentPath(framework).replace(/\.(tsx|jsx)$/, ""));
      const injection = injectProvider(layoutPath, layoutContent, specifier);

      if (injection.injected) {
        files.push({
          path: layoutPath,
          purpose: "Mounts the analytics provider so page views are recorded automatically.",
          isNew: false,
          content: injection.content,
          diff: createFileDiff(layoutContent, injection.content, { filePath: layoutPath }),
          applied: [],
          skipped: [],
        });
        instrumentationResults.push({
          filePath: layoutPath,
          originalContent: layoutContent,
          instrumentedContent: injection.content,
          applied: [],
          skipped: [],
          unchanged: false,
        });
      } else if (injection.reason && !injection.reason.includes("already mounts")) {
        warnings.push({ code: "provider_not_mounted", message: injection.reason, path: layoutPath });
      }
    }
  } else {
    warnings.push({
      code: "layout_not_found",
      message:
        "The app's root layout could not be located, so page views are not wired up. Import AletschAnalytics in your root component by hand.",
    });
  }

  // ── 4. package.json ────────────────────────────────────────

  if (options.includePostHog && !trackerOptions.postHogAlreadyInstalled) {
    const packageJsonPath = repoFilePaths.includes("package.json") ? "package.json" : null;
    const packageJsonText = packageJsonPath ? await options.readFile(packageJsonPath) : null;

    if (packageJsonText) {
      const updated = addPostHogDependency(packageJsonText);
      if (updated.changed) {
        files.push({
          path: packageJsonPath!,
          purpose: "Adds posthog-js, required by the generated provider.",
          isNew: false,
          content: updated.content,
          diff: createFileDiff(packageJsonText, updated.content, { filePath: packageJsonPath! }),
          applied: [],
          skipped: [],
        });
      }
    } else {
      warnings.push({
        code: "package_json_missing",
        message: "package.json could not be read, so posthog-js was not added. Install it manually.",
      });
    }
  }

  // ── 5. Validate ────────────────────────────────────────────

  const validation = validateChangeSet(instrumentationResults);
  for (const file of generated) {
    const generatedValidation = validateGeneratedFile(file.path, file.content);
    validation.files.push(generatedValidation);
    validation.errorCount += generatedValidation.issues.filter((issue) => issue.severity === "error").length;
    validation.warningCount += generatedValidation.issues.filter((issue) => issue.severity === "warning").length;
  }
  validation.valid = validation.errorCount === 0;

  const diffSummary = summarizeDiffs(files.map((file) => file.diff));

  return {
    files,
    validation,
    summary: {
      filesChanged: diffSummary.filesChanged,
      filesCreated: diffSummary.filesCreated,
      additions: diffSummary.additions,
      deletions: diffSummary.deletions,
      eventsInstrumented,
      eventsSkipped,
    },
    warnings,
    setupInstructions: renderSetupInstructions(trackerOptions, options.writeKey),
    isEmpty: files.every((file) => file.diff.unchanged),
  };
}

/** Markdown body for the pull request Aletsch opens. */
export function renderPullRequestBody(changeSet: ChangeSet, catalog: EventCatalog, projectName: string): string {
  const instrumented = changeSet.files.filter((file) => file.applied.length > 0);
  const created = changeSet.files.filter((file) => file.isNew);

  const eventRows = changeSet.files
    .flatMap((file) => file.applied.map((edit) => ({ file: file.path, ...edit })))
    .map((edit) => `| \`${edit.eventName}\` | \`${edit.file}:${edit.lineNumber}\` | ${edit.attribute} | ${edit.mode === "wrapped_existing_handler" ? "wrapped existing handler" : "handler added"} |`)
    .join("\n");

  const skippedRows = changeSet.files
    .flatMap((file) => file.skipped.map((skip) => ({ file: file.path, ...skip })))
    .map((skip) => `- \`${skip.file}:${skip.lineNumber}\` — ${skip.reason}`)
    .join("\n");

  const sections = [
    `## Auto-instrumented analytics for ${projectName}`,
    "",
    "Generated by [Aletsch AI](https://github.com/) from static analysis of this repository. Every change below is an AST transform: existing handlers are **wrapped**, never replaced, so arguments, return values and async behaviour are unchanged.",
    "",
    "### Summary",
    "",
    `- **${changeSet.summary.eventsInstrumented}** event call sites added across **${instrumented.length}** file${instrumented.length === 1 ? "" : "s"}`,
    `- **${created.length}** new file${created.length === 1 ? "" : "s"} (analytics runtime)`,
    `- **+${changeSet.summary.additions} / -${changeSet.summary.deletions}** lines`,
    `- Events named by: ${catalog.stats.llmClassified} AI-inferred, ${catalog.stats.ruleClassified} rule-based`,
    "",
  ];

  if (eventRows) {
    sections.push("### Events", "", "| Event | Location | Prop | Change |", "| --- | --- | --- | --- |", eventRows, "");
  }

  if (skippedRows) {
    sections.push(
      "### Skipped",
      "",
      "These interactions were detected but not instrumented automatically:",
      "",
      skippedRows,
      ""
    );
  }

  if (changeSet.warnings.length > 0) {
    sections.push(
      "### Warnings",
      "",
      ...changeSet.warnings.map((warning) => `- ${warning.message}`),
      ""
    );
  }

  sections.push(changeSet.setupInstructions);

  return sections.join("\n");
}
