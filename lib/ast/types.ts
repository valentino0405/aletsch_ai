// ============================================================
// Aletsch AI — AST Analysis Types
// All shared types for the interaction detection pipeline
// ============================================================

export type InteractionType =
  | "button_click"
  | "form_submit"
  | "input_change"
  | "input_focus"
  | "input_blur"
  | "navigation"
  | "selection_change"
  | "tab_change"
  | "checkbox_change"
  | "modal_open"
  | "modal_close"
  | "api_action"
  | "authentication"
  | "repository_connection"
  | "unknown";

export type DetectionMethod =
  | "jsx_button_handler"
  | "jsx_form_submit"
  | "jsx_input_handler"
  | "jsx_link_href"
  | "jsx_next_link"
  | "router_push"
  | "router_replace"
  | "jsx_select_handler"
  | "jsx_checkbox_handler"
  | "jsx_tab_handler"
  | "jsx_modal_handler"
  | "custom_component_handler"
  | "inferred_handler";

export type AnalysisStatus =
  | "idle"
  | "queued"
  | "analyzing"
  | "completed"
  | "failed"
  | "completed_with_warnings";

export interface DetectedInteraction {
  type: InteractionType;
  label: string;
  eventName: string;
  handler: string;
  componentName: string;
  filePath: string;
  route: string;
  lineNumber: number;
  confidence: number;
  detectionMethod: DetectionMethod;
  metadata?: Record<string, unknown>;
}

export interface DetectedComponent {
  name: string;
  filePath: string;
  route: string;
  lineNumber: number;
  isDefaultExport: boolean;
  interactionCount: number;
}

export interface ParsedFileResult {
  filePath: string;
  success: boolean;
  error?: string;
  route: string;
  components: DetectedComponent[];
  interactions: DetectedInteraction[];
}

export interface AnalysisResult {
  filesScanned: number;
  filesParsed: number;
  filesSkipped: number;
  parseErrors: number;
  componentsDetected: number;
  routesDetected: number;
  interactionsDetected: number;
  routes: string[];
  components: DetectedComponent[];
  interactions: DetectedInteraction[];
  errors: Array<{ filePath: string; error: string }>;
}
