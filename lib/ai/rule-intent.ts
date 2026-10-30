import type { DetectedInteraction } from "@/lib/ast/types";
import type { InteractionIntent, EventCategory, FunnelStage } from "./intent-classifier";

const words = (value: unknown) => String(value ?? "").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const slug = (value: unknown) => words(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 42) || "control";

/** Evidence describes a requested action. Static code cannot prove a business outcome. */
export function inferRuleIntent(interaction: DetectedInteraction): Omit<InteractionIntent, "key" | "source"> {
  const metadata = interaction.metadata ?? {};
  const source = String(metadata.handlerSource ?? "");
  const handler = words(`${source} ${interaction.handler} ${JSON.stringify(metadata.calledFunctions ?? [])}`);
  const label = words(interaction.label);
  const scope = words(`${interaction.componentName} ${interaction.route} ${JSON.stringify(metadata.formContext ?? {})}`);
  const destination = String(metadata.navigationTarget ?? metadata.href ?? metadata.target ?? "");
  const name = slug(metadata.name ?? interaction.label).replace(/^(?:handle|on|set)_/, "");
  const result = (eventName: string, intent: string, confidence = 0.9, category: EventCategory = "interaction", funnelStage: FunnelStage = "engagement", importance: InteractionIntent["importance"] = "medium") => ({
    eventName, intent, confidence: Math.min(confidence, interaction.confidence), category, funnelStage, importance,
  });

  // Structural activity is never re-labelled as a business conversion.
  if (interaction.type === "input_change") return result(`${name}_changed`, `User edits the ${name} field; no field value is captured.`, 0.9, "form", "engagement", "low");
  if (interaction.type === "input_focus") return result(`${name}_focused`, `User focuses the ${name} field.`, 0.9, "form", "engagement", "low");
  if (interaction.type === "input_blur") return result(`${name}_blurred`, `User leaves the ${name} field.`, 0.9, "form", "engagement", "low");
  if (interaction.type === "keyboard_interaction") return result(`${name}_key_pressed`, `User uses the keyboard on ${interaction.componentName}.`, 0.85, "interaction", "engagement", "low");
  if (interaction.type === "checkbox_change") return result(`${name}_toggled`, `User changes the ${name} checkbox.`, 0.9, "form");
  if (interaction.type === "selection_change") return result(`${name}_selection_changed`, `User changes the ${name} selection.`, 0.85);
  if (interaction.type === "tab_change") return result(`${name}_tab_changed`, `User changes the selected tab.`, 0.85);
  if (interaction.type === "modal_open") return result(metadata.handlerAttribute === "onOpenChange" ? "modal_open_state_changed" : "modal_open_requested", "User requests changing the dialog state; completion and transition direction are not inferred.", 0.85);
  if (interaction.type === "modal_close") return result("modal_closed", "The dialog close callback is invoked.", 0.85);
  if (interaction.type === "navigation") return result("navigation_clicked", "User activates a navigation link; this does not imply authentication or purchase.", 0.95, "navigation", "discovery");

  // Actions in the handler take precedence over generic labels and page names.
  if (/\bshow_help\b|\bopen_help\b/.test(handler)) return result("help_open_requested", "User requests help from this control.", 0.9, "interaction", "support");
  if (destination) return result(/(?:^|\/)checkout(?:\/|$)/i.test(destination) ? "checkout_initiated" : "navigation_clicked", `User requests navigation to ${destination.split(/[?#]/)[0]}.`, 0.95, "navigation", /checkout/i.test(destination) ? "conversion" : "discovery");
  const opensUI = /\bset\w*(?:open|visible)\s*\(\s*true\s*\)/i.test(source) || /\b(?:open|show)\w*(?:modal|dialog|drawer)\s*\(/i.test(source);
  if (opensUI) {
    if (/\bdelete\b|\bremove\b/.test(label) && /confirm/i.test(source)) return result("delete_confirmation_open_requested", "User opens a deletion confirmation; no deletion has been completed.", 0.92);
    const knownDialog = /modal|dialog|drawer|sheet/.test(scope + " " + handler);
    return result(knownDialog ? "modal_open_requested" : "ui_open_requested", "User requests opening a UI element; its business effect is not inferred.", knownDialog ? 0.9 : 0.7);
  }
  if (/\bset\w*(?:open|visible)\s*\(\s*false\s*\)/i.test(source)) return result("ui_close_requested", "User requests closing a UI element.");
  if (/\badd_to_cart\b/.test(handler + " " + label)) return result("add_to_cart", "User requests adding a product to the cart; the handler outcome is not verified.", 0.95, "interaction", "conversion", "high");
  if (/\b(sign_in|login|log_in|handle_login)\b/.test(handler)) return result("login_submit", "User submits a login attempt; authentication success is not inferred.", 0.95, "form", "activation", "high");
  if (/\b(sign_up|signup|register|create_account)\b/.test(handler)) return result("signup_submit", "User submits a registration attempt; account creation is not inferred.", 0.95, "form", "acquisition", "high");

  const isForm = interaction.type === "form_submit";
  if (isForm) {
    if (/feedback/.test(handler + " " + scope)) return result("feedback_submit", "User submits feedback for processing.", 0.92, "form", "support", "high");
    if (/search/.test(handler + " " + scope)) return result("search_submitted", "User submits a search request.", 0.92, "form", "engagement", "high");
    if (/login|sign_in/.test(scope)) return result("login_submit", "User submits the login form; success is not inferred.", 0.9, "form", "activation", "high");
    if (/registration|register|signup|sign_up/.test(scope)) return result("signup_submit", "User submits the registration form; success is not inferred.", 0.9, "form", "acquisition", "high");
    return result("form_submit", `User submits the ${interaction.componentName} form for processing.`, 0.75, "form", "unknown", "high");
  }
  if (/\bsave\b|\bsave_[a-z]/.test(handler + " " + label)) {
    const qualifier = slug(interaction.componentName).replace(/_?(form|page|view|panel|card)$/, "");
    return result(`${qualifier === "page" || qualifier === "unknown" || !qualifier ? "" : qualifier + "_"}save_attempted`, "User requests saving changes; validation and persistence may still fail.", 0.85, "interaction", "engagement", "high");
  }
  if (/\bdelete\b|\bremove\b/.test(label)) return result("deletion_requested", "User requests deletion; confirmation and completion are not inferred.", 0.75);
  if (/\bcontinue\b|\bnext\b/.test(label)) {
    if (/checkout/.test(scope)) return result("checkout_continue", "User advances in checkout; purchase completion is not inferred.", 0.85, "interaction", "conversion", "high");
    if (/registration|register|signup|sign_up/.test(scope)) return result("signup_continue", "User advances in registration; account creation is not inferred.", 0.85, "interaction", "acquisition", "high");
  }
  return result(`${name}_clicked`, `User activates ${interaction.label || "this control"} in ${interaction.componentName}; further business intent is ambiguous.`, 0.55, "interaction", "unknown");
}
