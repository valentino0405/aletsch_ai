// ============================================================
// Aletsch AI — Event Name Generator
// Deterministically normalizes interaction labels into
// analytics-friendly snake_case event names.
// NO LLM is used — pure string transformation.
// ============================================================

import type { InteractionType } from "./types";

// ── Prefix rules based on interaction type ──────────────────
const TYPE_PREFIX_MAP: Partial<Record<InteractionType, string>> = {
  button_click: "",
  form_submit: "form",
  input_change: "input",
  input_focus: "input",
  input_blur: "input",
  navigation: "navigate",
  selection_change: "select",
  tab_change: "tab",
  checkbox_change: "checkbox",
  modal_open: "modal",
  modal_close: "modal",
  authentication: "auth",
  repository_connection: "repo",
  api_action: "api",
};

// ── Semantic keyword → verb mappings ────────────────────────
const SEMANTIC_MAP: Array<{ patterns: RegExp[]; replacement: string }> = [
  { patterns: [/\blogin\b/i, /\bsign.?in\b/i], replacement: "user_login" },
  { patterns: [/\bsign.?up\b/i, /\bregister\b/i, /\bcreate.?account\b/i], replacement: "user_signup" },
  { patterns: [/\blogout\b/i, /\bsign.?out\b/i], replacement: "user_logout" },
  { patterns: [/\bconnect.?repo/i, /\brepository.?connect/i, /\badd.?repo/i], replacement: "repository_connect" },
  { patterns: [/\bdisconnect.?repo/i, /\bremove.?repo/i], replacement: "repository_disconnect" },
  { patterns: [/\banalyze\b/i, /\brun.?analys/i, /\bstart.?analys/i], replacement: "analysis_start" },
  { patterns: [/\bcreate.?project/i, /\bnew.?project/i], replacement: "project_create" },
  { patterns: [/\bdelete.?project/i, /\bremove.?project/i], replacement: "project_delete" },
  { patterns: [/\bcreate.?task/i, /\bnew.?task/i, /\badd.?task/i], replacement: "task_create" },
  { patterns: [/\bcomplete.?task/i, /\bmark.?done/i], replacement: "task_complete" },
  { patterns: [/\bsubmit\b/i], replacement: "form_submit" },
  { patterns: [/\bsave\b/i, /\bupdate\b/i], replacement: "data_save" },
  { patterns: [/\bsearch\b/i, /\bfind\b/i], replacement: "search" },
  { patterns: [/\bfilter\b/i], replacement: "filter_apply" },
  { patterns: [/\bupload\b/i], replacement: "file_upload" },
  { patterns: [/\bdownload\b/i, /\bexport\b/i], replacement: "file_download" },
  { patterns: [/\bopen.?modal/i, /\bshow.?modal/i, /\bopen.?dialog/i], replacement: "modal_open" },
  { patterns: [/\bclose.?modal/i, /\bhide.?modal/i, /\bclose.?dialog/i], replacement: "modal_close" },
  { patterns: [/\bdashboard\b/i], replacement: "page_dashboard_view" },
  { patterns: [/\bsettings?\b/i, /\bpreferences?\b/i], replacement: "settings_view" },
  { patterns: [/\bprofile\b/i], replacement: "profile_view" },
  { patterns: [/\bnavigate\b/i, /\bgo.?to\b/i], replacement: "navigate" },
  { patterns: [/\bpay\b/i, /\bcheckout\b/i, /\bpurchase\b/i], replacement: "payment_initiate" },
  { patterns: [/\bcancel\b/i, /\bdiscard\b/i], replacement: "action_cancel" },
  { patterns: [/\bconfirm\b/i, /\bapprove\b/i], replacement: "action_confirm" },
  { patterns: [/\bdelete\b/i, /\bremove\b/i], replacement: "item_delete" },
  { patterns: [/\bedit\b/i, /\bmodify\b/i, /\bchange\b/i], replacement: "item_edit" },
  { patterns: [/\bview\b/i, /\bopen\b/i, /\bshow\b/i], replacement: "item_view" },
  { patterns: [/\bshare\b/i], replacement: "item_share" },
  { patterns: [/\bcopy\b/i], replacement: "item_copy" },
  { patterns: [/\brefresh\b/i, /\breload\b/i, /\bsync\b/i], replacement: "data_refresh" },
  { patterns: [/\bnotif/i, /\balert\b/i], replacement: "notification_action" },
];

/**
 * Normalizes a human-readable label/handler name into a snake_case event name.
 * Deterministic — no LLM.
 *
 * Examples:
 *   "Connect Repository" → "repository_connect"
 *   "handleLogin"        → "user_login"
 *   "Submit Form"        → "form_submit"
 *   "Create Task"        → "task_create"
 */
export function generateEventName(
  label: string,
  handler: string,
  type: InteractionType
): string {
  // Priority: label first, handler as fallback
  const candidates = [label, handler].filter(Boolean);

  // Check semantic map against all candidates
  for (const candidate of candidates) {
    for (const { patterns, replacement } of SEMANTIC_MAP) {
      if (patterns.some((p) => p.test(candidate))) {
        return replacement;
      }
    }
  }

  // Fallback: normalize the label or handler into snake_case
  const source = (label || handler || "unknown").trim();
  const normalized = normalizeToSnakeCase(source);

  const prefix = TYPE_PREFIX_MAP[type];
  if (prefix && !normalized.startsWith(prefix)) {
    return `${prefix}_${normalized}`.replace(/_+/g, "_").replace(/^_|_$/g, "");
  }

  return normalized || `${type}_event`;
}

/**
 * Converts camelCase, PascalCase, or spaced strings to snake_case.
 * "handleConnectRepository" → "connect_repository"
 * "Connect Repository"      → "connect_repository"
 * "handleLogin"             → "login"
 */
function normalizeToSnakeCase(input: string): string {
  // Strip leading "handle" / "on" / "set" prefixes
  let s = input
    .replace(/^(handle|on|set|toggle|open|close|show|hide)/i, "")
    .trim();

  // Insert underscore before uppercase sequences
  s = s
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/[\s\-]+/g, "_")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  return s || "event";
}

/**
 * Extracts the most human-readable label from JSX attributes and text,
 * using the priority: text → aria-label → title → name → id → handler → component
 */
export function extractLabel(
  jsxText?: string,
  ariaLabel?: string,
  title?: string,
  name?: string,
  id?: string,
  handler?: string,
  componentName?: string
): string {
  const candidates = [jsxText, ariaLabel, title, name, id];
  for (const c of candidates) {
    const cleaned = c?.trim().replace(/\s+/g, " ");
    if (cleaned && cleaned.length > 0 && cleaned.length < 100) {
      return cleaned;
    }
  }

  // Humanize handler: handleLogin → Login, handleConnectRepository → Connect Repository
  if (handler) {
    const humanized = handler
      .replace(/^(handle|on|set|toggle|open|close|show|hide)/i, "")
      .replace(/([A-Z])/g, " $1")
      .trim();
    if (humanized) return humanized;
  }

  if (componentName) return componentName;
  return "Unknown Action";
}
