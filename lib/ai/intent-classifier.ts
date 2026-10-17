// ============================================================
// Aletsch AI — Semantic intent inference
// ------------------------------------------------------------
// Turns structurally-detected interactions into *meaningful* analytics
// events by asking an LLM what the user is trying to accomplish.
//
// Guarantees:
//   • Only metadata (label, handler name, component, route, element
//     type) is sent to the model — never file contents, never
//     credentials. Every field is passed through the secret redactor.
//   • Every model response is schema-validated. Anything malformed is
//     discarded and the deterministic rule engine is used instead, so
//     the pipeline never depends on the LLM being available.
//   • The source of each classification is recorded, so the UI can say
//     "AI-inferred" vs "rule-based" honestly.
// ============================================================

import { AIService } from "./client";
import { generateEventName } from "@/lib/ast/event-name-generator";
import { redactSecrets } from "@/lib/security/secret-filter";
import type { DetectedInteraction, InteractionType } from "@/lib/ast/types";

export type EventCategory = "pageview" | "interaction" | "form" | "navigation" | "conversion" | "system";

export type FunnelStage =
  | "discovery"
  | "acquisition"
  | "activation"
  | "engagement"
  | "conversion"
  | "retention"
  | "support"
  | "unknown";

export type Importance = "high" | "medium" | "low";

export interface InteractionIntent {
  /** Stable key: `${filePath}#${lineNumber}`. */
  key: string;
  eventName: string;
  category: EventCategory;
  /** One sentence describing what the user is trying to do. */
  intent: string;
  importance: Importance;
  funnelStage: FunnelStage;
  /** 0..1 confidence in the *semantic* classification. */
  confidence: number;
  source: "llm" | "rules";
}

const VALID_CATEGORIES: EventCategory[] = [
  "pageview",
  "interaction",
  "form",
  "navigation",
  "conversion",
  "system",
];
const VALID_STAGES: FunnelStage[] = [
  "discovery",
  "acquisition",
  "activation",
  "engagement",
  "conversion",
  "retention",
  "support",
  "unknown",
];
const VALID_IMPORTANCE: Importance[] = ["high", "medium", "low"];

/** Analytics event names must be lowercase snake_case. */
export const EVENT_NAME_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

export function isValidEventName(name: unknown): name is string {
  return typeof name === "string" && name.length >= 3 && name.length <= 60 && EVENT_NAME_PATTERN.test(name);
}

export function interactionKey(interaction: Pick<DetectedInteraction, "filePath" | "lineNumber">): string {
  return `${interaction.filePath}#${interaction.lineNumber}`;
}

// ────────────────────────────────────────────────────────────
// Deterministic rule engine (always available)
// ────────────────────────────────────────────────────────────

const CATEGORY_BY_TYPE: Record<InteractionType, EventCategory> = {
  button_click: "interaction",
  form_submit: "form",
  input_change: "form",
  input_focus: "form",
  input_blur: "form",
  navigation: "navigation",
  selection_change: "interaction",
  tab_change: "interaction",
  checkbox_change: "form",
  modal_open: "interaction",
  modal_close: "interaction",
  api_action: "system",
  authentication: "conversion",
  repository_connection: "conversion",
  unknown: "interaction",
};

const CONVERSION_KEYWORDS =
  /\b(sign.?up|register|subscribe|checkout|purchase|pay|buy|upgrade|connect|create|submit|confirm|complete|publish|deploy|invite)\b/i;
const ACQUISITION_KEYWORDS = /\b(sign.?up|register|create.?account|get.?started|try.?free|request.?demo)\b/i;
const ACTIVATION_KEYWORDS = /\b(login|sign.?in|onboard|setup|connect|import|first)\b/i;
const RETENTION_KEYWORDS = /\b(settings?|profile|preferences?|notification|billing|subscription|renew)\b/i;
const SUPPORT_KEYWORDS = /\b(help|support|docs?|documentation|contact|feedback|report)\b/i;
const LOW_VALUE_KEYWORDS = /\b(toggle|collapse|expand|theme|sidebar|scroll|tooltip|close|dismiss|back)\b/i;

function ruleFunnelStage(text: string, type: InteractionType): FunnelStage {
  if (type === "authentication") return "activation";
  if (ACQUISITION_KEYWORDS.test(text)) return "acquisition";
  if (CONVERSION_KEYWORDS.test(text)) return "conversion";
  if (ACTIVATION_KEYWORDS.test(text)) return "activation";
  if (SUPPORT_KEYWORDS.test(text)) return "support";
  if (RETENTION_KEYWORDS.test(text)) return "retention";
  if (type === "navigation") return "discovery";
  if (type === "unknown") return "unknown";
  return "engagement";
}

function ruleImportance(text: string, type: InteractionType, structuralConfidence: number): Importance {
  if (CONVERSION_KEYWORDS.test(text) || type === "authentication" || type === "form_submit") return "high";
  if (LOW_VALUE_KEYWORDS.test(text)) return "low";
  if (type === "input_focus" || type === "input_blur" || type === "input_change") return "low";
  if (structuralConfidence >= 0.9) return "medium";
  return "low";
}

/**
 * Classifies one interaction without any network call. This is the
 * baseline result: the LLM can only *improve* on it, never block it.
 */
export function classifyWithRules(interaction: DetectedInteraction): InteractionIntent {
  const text = `${interaction.label} ${interaction.handler} ${interaction.componentName}`;
  const category = CATEGORY_BY_TYPE[interaction.type] ?? "interaction";
  const funnelStage = ruleFunnelStage(text, interaction.type);
  const importance = ruleImportance(text, interaction.type, interaction.confidence);

  const eventName = isValidEventName(interaction.eventName)
    ? interaction.eventName
    : generateEventName(interaction.label, interaction.handler, interaction.type);

  return {
    key: interactionKey(interaction),
    eventName: isValidEventName(eventName) ? eventName : `${interaction.type}_event`,
    category,
    intent: describeRuleIntent(interaction),
    importance,
    funnelStage,
    // Rule-based semantics are bounded by the structural confidence:
    // we know *what* the element is far better than *why* it exists.
    confidence: Math.min(0.75, Math.round(interaction.confidence * 100) / 100),
    source: "rules",
  };
}

function describeRuleIntent(interaction: DetectedInteraction): string {
  const label = interaction.label && interaction.label !== "Unknown Action" ? `"${interaction.label}"` : "this control";
  switch (interaction.type) {
    case "form_submit":
      return `User submits the ${interaction.componentName} form.`;
    case "navigation":
      return `User navigates using ${label}.`;
    case "authentication":
      return `User performs an authentication action via ${label}.`;
    case "modal_open":
      return `User opens a dialog from ${label}.`;
    case "modal_close":
      return `User dismisses a dialog via ${label}.`;
    case "input_change":
      return `User edits the ${label} field.`;
    case "tab_change":
      return `User switches to the ${label} tab.`;
    case "selection_change":
      return `User changes the ${label} selection.`;
    case "checkbox_change":
      return `User toggles ${label}.`;
    default:
      return `User activates ${label} in ${interaction.componentName}.`;
  }
}

// ────────────────────────────────────────────────────────────
// LLM classification
// ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the semantic analysis layer of Aletsch AI, a product analytics instrumentation tool.

You receive a JSON array of UI interactions that a static analyser found in a web application. For EACH interaction you must infer what the *user* is trying to accomplish, and name an analytics event for it.

Respond with a JSON array ONLY. One object per input item, same order, with exactly these fields:
{
  "id": <the integer id from the input>,
  "eventName": "lowercase_snake_case, 3-60 chars, verb-object form, e.g. project_created, checkout_started",
  "category": "one of: pageview | interaction | form | navigation | conversion | system",
  "intent": "one short sentence describing the user's goal",
  "importance": "one of: high | medium | low",
  "funnelStage": "one of: discovery | acquisition | activation | engagement | conversion | retention | support | unknown"
}

Rules:
- Name events after the user's goal, not the DOM element. "Save Changes" -> settings_saved, not button_clicked.
- Mark revenue, signup, and primary-conversion actions as importance "high".
- Mark cosmetic actions (theme toggles, sidebar collapse, tooltips) as importance "low".
- Never invent interactions that are not in the input. Never omit one.
- Output raw JSON. No prose, no markdown fences.`;

interface LLMCandidate {
  id: number;
  interaction: DetectedInteraction;
}

/** Compact, source-free description of one interaction for the prompt. */
function toPromptItem(candidate: LLMCandidate, routeHint: string) {
  const clean = (value: string | undefined) => redactSecrets(String(value ?? "")).text.slice(0, 120);
  return {
    id: candidate.id,
    elementType: candidate.interaction.type,
    label: clean(candidate.interaction.label),
    handlerName: clean(candidate.interaction.handler),
    component: clean(candidate.interaction.componentName),
    route: clean(candidate.interaction.route || routeHint),
  };
}

function validateLLMEntry(raw: any, byId: Map<number, DetectedInteraction>): InteractionIntent | null {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "number" ? raw.id : Number(raw.id);
  const interaction = byId.get(id);
  if (!interaction) return null;

  if (!isValidEventName(raw.eventName)) return null;
  if (!VALID_CATEGORIES.includes(raw.category)) return null;
  if (!VALID_IMPORTANCE.includes(raw.importance)) return null;
  if (!VALID_STAGES.includes(raw.funnelStage)) return null;
  if (typeof raw.intent !== "string" || raw.intent.trim().length < 3) return null;

  return {
    key: interactionKey(interaction),
    eventName: raw.eventName,
    category: raw.category,
    intent: redactSecrets(raw.intent.trim()).text.slice(0, 240),
    importance: raw.importance,
    funnelStage: raw.funnelStage,
    // Semantic confidence is capped by how sure the AST layer was that
    // this element is interactive at all.
    confidence: Math.round(Math.min(0.95, 0.6 + interaction.confidence * 0.35) * 100) / 100,
    source: "llm",
  };
}

export interface ClassificationOptions {
  /** Interactions per LLM request. Smaller batches parse more reliably. */
  batchSize?: number;
  /** Hard ceiling on how many interactions are sent to the model. */
  maxInteractions?: number;
  /** Framework label, given to the model as context. */
  frameworkLabel?: string;
  /** Called after each batch so the job UI can show progress. */
  onProgress?: (done: number, total: number) => void | Promise<void>;
}

export interface ClassificationResult {
  intents: Map<string, InteractionIntent>;
  llmClassified: number;
  ruleClassified: number;
  llmAvailable: boolean;
  /** Populated when the model was configured but calls failed. */
  llmError?: string;
}

/**
 * Classifies every interaction, using the LLM where possible and the
 * rule engine everywhere else.
 *
 * Interactions are prioritised so that when the budget is exhausted it
 * is the low-signal controls (focus/blur handlers, toggles) that fall
 * back to rules — not the checkout button.
 */
export async function classifyInteractions(
  interactions: DetectedInteraction[],
  options: ClassificationOptions = {}
): Promise<ClassificationResult> {
  const intents = new Map<string, InteractionIntent>();

  // Baseline: everything gets a deterministic classification first.
  for (const interaction of interactions) {
    intents.set(interactionKey(interaction), classifyWithRules(interaction));
  }

  if (!AIService.isConfigured() || interactions.length === 0) {
    return {
      intents,
      llmClassified: 0,
      ruleClassified: intents.size,
      llmAvailable: false,
    };
  }

  const batchSize = options.batchSize ?? 12;
  const maxInteractions = options.maxInteractions ?? 96;

  // Highest structural confidence and most meaningful types first.
  const priority = (i: DetectedInteraction) => {
    const typeBoost =
      i.type === "form_submit" || i.type === "authentication" ? 0.3 : i.type === "button_click" ? 0.2 : 0;
    const noiseePenalty = i.type === "input_focus" || i.type === "input_blur" ? 0.4 : 0;
    return i.confidence + typeBoost - noiseePenalty;
  };
  const selected = [...interactions].sort((a, b) => priority(b) - priority(a)).slice(0, maxInteractions);

  let llmClassified = 0;
  let llmError: string | undefined;

  for (let offset = 0; offset < selected.length; offset += batchSize) {
    const slice = selected.slice(offset, offset + batchSize);
    const candidates: LLMCandidate[] = slice.map((interaction, index) => ({
      id: offset + index,
      interaction,
    }));
    const byId = new Map(candidates.map((c) => [c.id, c.interaction]));

    const userPrompt = JSON.stringify({
      framework: options.frameworkLabel ?? "unknown",
      interactions: candidates.map((c) => toPromptItem(c, c.interaction.route)),
    });

    try {
      const parsed = await AIService.generateStructured<any[]>(SYSTEM_PROMPT, userPrompt, (data) => {
        // Accept either a bare array or `{ interactions: [...] }`.
        const list = Array.isArray(data) ? data : Array.isArray(data?.interactions) ? data.interactions : null;
        return list;
      });

      if (!parsed) {
        llmError ??= "The model returned a response that could not be parsed as JSON.";
        continue;
      }

      for (const entry of parsed) {
        const intent = validateLLMEntry(entry, byId);
        if (intent) {
          intents.set(intent.key, intent);
          llmClassified++;
        }
      }
    } catch (error: any) {
      llmError ??= error?.message || "LLM request failed.";
    }

    await options.onProgress?.(Math.min(offset + batchSize, selected.length), selected.length);
  }

  return {
    intents,
    llmClassified,
    ruleClassified: intents.size - llmClassified,
    llmAvailable: true,
    llmError: llmClassified === 0 ? llmError : undefined,
  };
}
