// ============================================================
// Aletsch AI — Event catalog generation
// ------------------------------------------------------------
// Turns (interaction × inferred intent) pairs into a de-duplicated
// catalog of analytics events, each with a property schema and the
// list of code sites that will emit it.
//
// This is the artefact the developer reviews and approves before any
// code is written. Nothing here touches the filesystem or GitHub.
// ============================================================

import type { DetectedInteraction } from "@/lib/ast/types";
import {
  classifyWithRules,
  interactionKey,
  isValidEventName,
  type EventCategory,
  type FunnelStage,
  type Importance,
  type InteractionIntent,
} from "@/lib/ai/intent-classifier";

export interface EventProperty {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  /** Literal value known at build time, if any. */
  constant?: string;
}

/** One place in the source tree that will emit this event. */
export interface EventSite {
  filePath: string;
  lineNumber: number;
  componentName: string;
  route: string;
  label: string;
  handler: string;
  interactionType: DetectedInteraction["type"];
  detectionMethod: DetectedInteraction["detectionMethod"];
  tagName: string;
  /** Structural confidence from the AST layer. */
  confidence: number;
  metadata?: Record<string, any>;
}

export interface GeneratedEvent {
  eventName: string;
  displayName: string;
  /** What the user is trying to accomplish. */
  description: string;
  category: EventCategory;
  funnelStage: FunnelStage;
  importance: Importance;
  confidence: number;
  source: "llm" | "rules";
  properties: EventProperty[];
  sites: EventSite[];
  /** Pre-ticked in the review UI. Low-value/noisy events start unticked. */
  selectedByDefault: boolean;
  /** Why it is not pre-selected, shown to the developer. */
  deselectReason?: string;
}

export interface EventCatalogStats {
  totalInteractions: number;
  uniqueEvents: number;
  /** Interactions folded into an existing event. */
  deduplicated: number;
  llmClassified: number;
  ruleClassified: number;
  selectedByDefault: number;
  byImportance: Record<Importance, number>;
  byCategory: Record<string, number>;
  byFunnelStage: Record<string, number>;
}

export interface EventCatalog {
  events: GeneratedEvent[];
  stats: EventCatalogStats;
  llmAvailable: boolean;
  llmError?: string;
  generatedAt: string;
}

/** Interaction types that produce high-volume, low-signal events. */
const NOISY_TYPES = new Set<DetectedInteraction["type"]>([
  "input_change",
  "input_focus",
  "input_blur",
]);

const MIN_AUTO_SELECT_CONFIDENCE = 0.7;

// ────────────────────────────────────────────────────────────
// Property schema
// ────────────────────────────────────────────────────────────

/**
 * Base properties attached to every generated event.
 *
 * Deliberately excluded: input values, form field contents, URL query
 * strings, and anything else that could carry personal data. Aletsch
 * instruments *that an action happened*, never what was typed.
 */
function buildProperties(sites: EventSite[]): EventProperty[] {
  const properties: EventProperty[] = [
    { name: "component", type: "string", description: "React component that owns the element." },
    { name: "route", type: "string", description: "Logical route the interaction happened on." },
    { name: "element", type: "string", description: "JSX tag name of the element." },
    { name: "label", type: "string", description: "Visible label or accessible name of the control." },
  ];

  if (sites.some((s) => s.interactionType === "navigation")) {
    properties.push({ name: "destination", type: "string", description: "Navigation target path." });
  }
  if (sites.some((s) => s.interactionType === "form_submit")) {
    properties.push({ name: "form", type: "string", description: "Name of the form being submitted." });
  }

  // Single-site events can pin the values as constants, which makes the
  // generated call sites smaller and the schema self-documenting.
  if (sites.length === 1) {
    const site = sites[0];
    for (const property of properties) {
      if (property.name === "component") property.constant = site.componentName;
      if (property.name === "route") property.constant = site.route;
      if (property.name === "element") property.constant = site.tagName;
      if (property.name === "label") property.constant = site.label;
      if (property.name === "destination") property.constant = site.metadata?.href || site.metadata?.target;
    }
  }

  return properties;
}

// ────────────────────────────────────────────────────────────
// Naming & de-duplication
// ────────────────────────────────────────────────────────────

function toSnake(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase()
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
}

/**
 * Two interactions collapse into one event when they represent the
 * same user action. Identical event name + identical component is
 * always the same action (e.g. the same button rendered in a loop).
 */
function dedupeKey(eventName: string, site: EventSite): string {
  return `${eventName}::${site.componentName}::${site.route}`;
}

/**
 * Resolves a name collision between genuinely different actions by
 * qualifying with the component name — `saved` in `ProfileForm`
 * becomes `profile_form_saved`, not a second ambiguous `saved`.
 */
function disambiguate(eventName: string, site: EventSite, taken: Set<string>): string {
  const qualifier = toSnake(site.componentName).replace(/_?(page|view|form|panel|card|modal)$/, "");
  const candidates = [
    qualifier ? `${qualifier}_${eventName}` : "",
    site.route && site.route.startsWith("/") ? `${toSnake(site.route) || "root"}_${eventName}` : "",
    `${eventName}_${toSnake(site.tagName)}`,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (isValidEventName(candidate) && !taken.has(candidate)) return candidate;
  }

  let counter = 2;
  while (taken.has(`${eventName}_${counter}`)) counter++;
  return `${eventName}_${counter}`;
}

function toSite(interaction: DetectedInteraction): EventSite {
  return {
    filePath: interaction.filePath,
    lineNumber: interaction.lineNumber,
    componentName: interaction.componentName,
    route: interaction.route,
    label: interaction.label,
    handler: interaction.handler,
    interactionType: interaction.type,
    detectionMethod: interaction.detectionMethod,
    tagName: String(interaction.metadata?.tagName ?? ""),
    confidence: interaction.confidence,
    metadata: interaction.metadata,
  };
}

// ────────────────────────────────────────────────────────────
// Catalog
// ────────────────────────────────────────────────────────────

export interface CatalogOptions {
  llmAvailable?: boolean;
  llmError?: string;
  /** Include noisy input events as pre-selected. Off by default. */
  includeInputEvents?: boolean;
}

/**
 * Builds the reviewable event catalog.
 *
 * Interactions arrive in detection order; events come out sorted by
 * importance then by how many sites emit them, because that is the
 * order a developer wants to review them in.
 */
export function buildEventCatalog(
  interactions: DetectedInteraction[],
  intents: Map<string, InteractionIntent>,
  options: CatalogOptions = {}
): EventCatalog {
  const byEvent = new Map<string, GeneratedEvent>();
  const seenSites = new Set<string>();
  const takenNames = new Set<string>();
  let deduplicated = 0;
  let llmClassified = 0;
  let ruleClassified = 0;

  // Deterministic order so re-running analysis on unchanged source
  // produces an identical catalog (and therefore an empty diff).
  const ordered = [...interactions].sort((a, b) =>
    a.filePath === b.filePath ? a.lineNumber - b.lineNumber : a.filePath.localeCompare(b.filePath)
  );

  for (const interaction of ordered) {
    const intent = intents.get(interactionKey(interaction)) ?? classifyWithRules(interaction);
    const site = toSite(interaction);

    let eventName = isValidEventName(intent.eventName) ? intent.eventName : `${interaction.type}_event`;

    const existing = byEvent.get(eventName);
    if (existing) {
      const key = dedupeKey(eventName, site);
      if (seenSites.has(key)) {
        // Same action, same component, same route — one event, and the
        // site is already recorded. (Same button inside a .map().)
        deduplicated++;
        continue;
      }

      const sameAction =
        existing.description === intent.intent ||
        existing.sites.some((s) => s.componentName === site.componentName);

      if (sameAction) {
        seenSites.add(key);
        existing.sites.push(site);
        deduplicated++;
        continue;
      }

      // Different action that happens to share a name.
      eventName = disambiguate(eventName, site, takenNames);
    }

    takenNames.add(eventName);
    seenSites.add(dedupeKey(eventName, site));
    if (intent.source === "llm") llmClassified++;
    else ruleClassified++;

    byEvent.set(eventName, {
      eventName,
      displayName: interaction.label || eventName,
      description: intent.intent,
      category: intent.category,
      funnelStage: intent.funnelStage,
      importance: intent.importance,
      confidence: intent.confidence,
      source: intent.source,
      properties: [],
      sites: [site],
      selectedByDefault: false,
    });
  }

  const events = [...byEvent.values()];

  for (const event of events) {
    event.properties = buildProperties(event.sites);

    const noisy = event.sites.every((s) => NOISY_TYPES.has(s.interactionType));
    const lowConfidence = event.confidence < MIN_AUTO_SELECT_CONFIDENCE;

    if (noisy && !options.includeInputEvents) {
      event.selectedByDefault = false;
      event.deselectReason =
        "Field-level events fire on every keystroke. Enable only if you need form-completion analysis.";
    } else if (event.importance === "low") {
      event.selectedByDefault = false;
      event.deselectReason = "Classified as a low-value UI action.";
    } else if (lowConfidence) {
      event.selectedByDefault = false;
      event.deselectReason = `Detection confidence is ${Math.round(event.confidence * 100)}%. Review before enabling.`;
    } else {
      event.selectedByDefault = true;
    }
  }

  const importanceRank: Record<Importance, number> = { high: 0, medium: 1, low: 2 };
  events.sort((a, b) => {
    const byImportance = importanceRank[a.importance] - importanceRank[b.importance];
    if (byImportance !== 0) return byImportance;
    if (b.sites.length !== a.sites.length) return b.sites.length - a.sites.length;
    return a.eventName.localeCompare(b.eventName);
  });

  const byImportance: Record<Importance, number> = { high: 0, medium: 0, low: 0 };
  const byCategory: Record<string, number> = {};
  const byFunnelStage: Record<string, number> = {};
  for (const event of events) {
    byImportance[event.importance]++;
    byCategory[event.category] = (byCategory[event.category] ?? 0) + 1;
    byFunnelStage[event.funnelStage] = (byFunnelStage[event.funnelStage] ?? 0) + 1;
  }

  return {
    events,
    stats: {
      totalInteractions: interactions.length,
      uniqueEvents: events.length,
      deduplicated,
      llmClassified,
      ruleClassified,
      selectedByDefault: events.filter((e) => e.selectedByDefault).length,
      byImportance,
      byCategory,
      byFunnelStage,
    },
    llmAvailable: options.llmAvailable ?? false,
    llmError: options.llmError,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Derives a funnel from the catalog by ordering the conversion-relevant
 * events along the standard product lifecycle. Used as the *suggested*
 * funnel; the real one is only rendered once events actually arrive.
 */
export function suggestFunnelSteps(catalog: EventCatalog): { eventName: string; label: string; stage: FunnelStage }[] {
  const stageOrder: FunnelStage[] = [
    "discovery",
    "acquisition",
    "activation",
    "engagement",
    "conversion",
    "retention",
  ];

  const picked: { eventName: string; label: string; stage: FunnelStage }[] = [];
  for (const stage of stageOrder) {
    const candidates = catalog.events
      .filter((e) => e.funnelStage === stage && e.importance !== "low")
      .sort((a, b) => b.confidence - a.confidence);
    if (candidates.length > 0) {
      picked.push({
        eventName: candidates[0].eventName,
        label: candidates[0].displayName,
        stage,
      });
    }
  }
  return picked;
}
