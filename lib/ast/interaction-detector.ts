// ============================================================
// Aletsch AI — Interaction Detector
// Uses ts-morph to walk JSX AST and detect user interactions.
// Deterministic — no LLM or code execution.
// ============================================================

import {
  Project,
  SyntaxKind,
  Node,
  JsxOpeningElement,
  JsxSelfClosingElement,
  FunctionDeclaration,
  ArrowFunction,
  FunctionExpression,
  VariableDeclaration,
} from "ts-morph";
import type {
  DetectedInteraction,
  DetectedComponent,
  ParsedFileResult,
  InteractionType,
  DetectionMethod,
} from "./types";
import { detectRouteFromPath } from "./route-detector";
import { generateEventName, extractLabel } from "./event-name-generator";

// ── Constants ────────────────────────────────────────────────

/** HTML/JSX tags always treated as button interactions */
const BUTTON_TAGS = new Set(["button", "Button"]);

/** Component name patterns indicating button-like behavior */
const BUTTON_LIKE_NAME_PATTERNS = [
  /button/i,
  /btn/i,
  /cta/i,
  /submit/i,
  /action/i,
  /trigger/i,
];

/** Authentication-related label patterns */
const AUTH_PATTERNS = [/login/i, /sign.?in/i, /sign.?up/i, /logout/i, /register/i, /auth/i];

/** Repository action patterns */
const REPO_PATTERNS = [/connect.?repo/i, /repository/i, /add.?repo/i, /clone/i, /sync.?repo/i];

// ── Helper: extract JSX attribute value ─────────────────────

function getJsxAttrString(element: JsxOpeningElement | JsxSelfClosingElement, attrName: string): string | undefined {
  try {
    const attrs = element.getAttributes();
    for (const attr of attrs) {
      if (!Node.isJsxAttribute(attr)) continue;
      const name = attr.getNameNode().getText();
      if (name !== attrName) continue;
      const init = attr.getInitializer();
      if (!init) return "true";
      if (Node.isStringLiteral(init)) return init.getLiteralValue();
      if (Node.isJsxExpression(init)) {
        const expr = init.getExpression();
        if (!expr) return undefined;
        if (Node.isStringLiteral(expr)) return expr.getLiteralValue();
        return expr.getText().replace(/['"]/g, "").trim();
      }
    }
  } catch { /* ignore */ }
  return undefined;
}

/** Extract visible text from a JSX element's children */
function getJsxTextContent(node: Node): string {
  try {
    const texts: string[] = [];
    node.forEachDescendant((child) => {
      if (Node.isJsxText(child)) {
        const t = child.getText().replace(/\s+/g, " ").trim();
        if (t) texts.push(t);
      }
    });
    return texts.join(" ").trim().substring(0, 80);
  } catch {
    return "";
  }
}

/** Determine the containing React component name for a given node */
function getContainingComponentName(node: Node): string {
  try {
    let current: Node | undefined = node.getParent();
    while (current) {
      if (Node.isFunctionDeclaration(current)) {
        const name = (current as FunctionDeclaration).getName();
        if (name && /^[A-Z]/.test(name)) return name;
      }
      if (Node.isArrowFunction(current) || Node.isFunctionExpression(current)) {
        const parent = current.getParent();
        if (Node.isVariableDeclaration(parent)) {
          const varName = (parent as VariableDeclaration).getName();
          if (varName && /^[A-Z]/.test(varName)) return varName;
        }
      }
      current = current.getParent();
    }
  } catch { /* ignore */ }
  return "Unknown";
}

/** Classify interaction type based on semantic label/handler analysis */
function classifyInteractionType(
  baseType: InteractionType,
  label: string,
  handler: string,
  tagName: string
): InteractionType {
  const combined = `${label} ${handler} ${tagName}`.toLowerCase();
  if (AUTH_PATTERNS.some((p) => p.test(combined))) return "authentication";
  if (REPO_PATTERNS.some((p) => p.test(combined))) return "repository_connection";
  return baseType;
}

/** Extract handler function name from an event attribute value */
function extractHandlerName(attrValue: string | undefined): string {
  if (!attrValue) return "";
  // e.g. "() => handleLogin()" → "handleLogin"
  // e.g. "handleLogin"         → "handleLogin"
  // e.g. "(e) => { submitForm(e) }" → "submitForm"
  const arrowMatch = attrValue.match(/=>\s*\{?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(?/);
  if (arrowMatch) return arrowMatch[1];
  // Direct reference
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(attrValue.trim())) return attrValue.trim();
  return attrValue.substring(0, 40);
}

// ── Main per-file analysis function ─────────────────────────

/**
 * Parses a single source file using ts-morph and returns all
 * detected React components and user interactions.
 * Never throws — errors are captured in result.error.
 */
export function parseFile(filePath: string, content: string): ParsedFileResult {
  const route = detectRouteFromPath(filePath);
  const result: ParsedFileResult = {
    filePath,
    success: false,
    route,
    components: [],
    interactions: [],
  };

  // Skip non-JSX/TS files early
  if (!/\.(tsx|jsx|ts|js)$/.test(filePath)) {
    result.error = "Unsupported file extension";
    return result;
  }

  // Skip obviously non-React files (no JSX angle-bracket hint)
  const looksLikeReact = /<[A-Za-z]/.test(content) || /return\s*\(/.test(content) || /jsx|tsx/.test(filePath);
  const isTypescriptModule = filePath.endsWith(".ts") || filePath.endsWith(".js");
  if (!looksLikeReact && !isTypescriptModule) {
    result.error = "File does not appear to contain React/JSX";
    return result;
  }

  let project: Project;
  try {
    project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        jsx: 4, // JsxEmit.ReactJSX
        allowJs: true,
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
      },
    });
  } catch (e: any) {
    result.error = `ts-morph Project init failed: ${e?.message}`;
    return result;
  }

  let sourceFile: ReturnType<typeof project.createSourceFile>;
  try {
    sourceFile = project.createSourceFile(filePath, content, { overwrite: true });
  } catch (e: any) {
    result.error = `Source file parse failed: ${e?.message}`;
    return result;
  }

  try {
    // ── 1. Detect React component functions ─────────────────
    detectComponents(sourceFile, filePath, route, result);

    // ── 2. Detect all JSX elements ──────────────────────────
    detectJsxInteractions(sourceFile, filePath, route, result);

    // ── 3. Detect router.push / router.replace ──────────────
    detectRouterNavigation(sourceFile, filePath, route, result);

    result.success = true;
  } catch (e: any) {
    result.error = `Analysis failed: ${e?.message}`;
    // Partial results are still returned
  }

  return result;
}

// ── Component Detection ─────────────────────────────────────

function detectComponents(
  sourceFile: ReturnType<typeof Project.prototype.createSourceFile>,
  filePath: string,
  route: string,
  result: ParsedFileResult
): void {
  // Named function declarations: function LoginForm() { ... }
  sourceFile.getFunctions().forEach((fn) => {
    const name = fn.getName();
    if (!name || !/^[A-Z]/.test(name)) return;
    result.components.push({
      name,
      filePath,
      route,
      lineNumber: fn.getStartLineNumber(),
      isDefaultExport: fn.isDefaultExport(),
      interactionCount: 0,
    });
  });

  // Arrow function / function expression components via variable declarations
  sourceFile.getVariableDeclarations().forEach((decl) => {
    const name = decl.getName();
    if (!name || !/^[A-Z]/.test(name)) return;
    const init = decl.getInitializer();
    if (!init) return;
    if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) {
      // Check it returns JSX
      const text = init.getText();
      if (!/<[A-Z]/.test(text) && !/<[a-z]/.test(text) && !/return\s*\(/.test(text)) return;
      result.components.push({
        name,
        filePath,
        route,
        lineNumber: decl.getStartLineNumber(),
        isDefaultExport: false,
        interactionCount: 0,
      });
    }
  });
}

// ── JSX Interaction Detection ────────────────────────────────

function detectJsxInteractions(
  sourceFile: ReturnType<typeof Project.prototype.createSourceFile>,
  filePath: string,
  route: string,
  result: ParsedFileResult
): void {
  const fileName = filePath.split("/").pop() || filePath;

  // Process JsxElements (open + close tags)
  sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement).forEach((jsxEl) => {
    const opening = jsxEl.getOpeningElement();
    processJsxElement(opening, jsxEl, filePath, route, fileName, result);
  });

  // Process JsxSelfClosingElements (<Input onChange={...} />)
  sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).forEach((jsxEl) => {
    processJsxElement(jsxEl, jsxEl, filePath, route, fileName, result);
  });
}

function processJsxElement(
  opening: JsxOpeningElement | JsxSelfClosingElement,
  fullNode: Node,
  filePath: string,
  route: string,
  fileName: string,
  result: ParsedFileResult
): void {
  try {
    const tagName = opening.getTagNameNode().getText();
    const lineNumber = opening.getStartLineNumber();
    const componentName = getContainingComponentName(opening);

    // ── Button interactions ──────────────────────────────────
    if (BUTTON_TAGS.has(tagName) || BUTTON_LIKE_NAME_PATTERNS.some((p) => p.test(tagName))) {
      const onClickValue = getJsxAttrString(opening, "onClick");
      const typeAttr = getJsxAttrString(opening, "type");
      const ariaLabel = getJsxAttrString(opening, "aria-label");
      const title = getJsxAttrString(opening, "title");
      const jsxText = getJsxTextContent(fullNode);
      const handler = extractHandlerName(onClickValue);

      // Only emit if there's a handler OR readable text
      if (!onClickValue && !jsxText && !ariaLabel) return;

      const label = extractLabel(jsxText, ariaLabel, title, undefined, undefined, handler, componentName);
      let interactionType: InteractionType = typeAttr === "submit" ? "form_submit" : "button_click";
      interactionType = classifyInteractionType(interactionType, label, handler, tagName);

      const confidence = BUTTON_TAGS.has(tagName)
        ? onClickValue ? 0.97 : 0.80
        : 0.75;

      const detectionMethod: DetectionMethod = BUTTON_TAGS.has(tagName)
        ? "jsx_button_handler"
        : "custom_component_handler";

      result.interactions.push({
        type: interactionType,
        label,
        eventName: generateEventName(label, handler, interactionType),
        handler,
        componentName,
        filePath,
        route,
        lineNumber,
        confidence,
        detectionMethod,
        metadata: { tagName, fileName },
      });
      return;
    }

    // ── Form submissions ─────────────────────────────────────
    if (tagName === "form" || tagName === "Form") {
      const onSubmit = getJsxAttrString(opening, "onSubmit");
      const handler = extractHandlerName(onSubmit);
      const jsxText = getJsxTextContent(fullNode);
      const ariaLabel = getJsxAttrString(opening, "aria-label");
      const label = extractLabel(jsxText, ariaLabel, undefined, undefined, undefined, handler, componentName);

      result.interactions.push({
        type: "form_submit",
        label: label || "Form Submit",
        eventName: generateEventName(label, handler, "form_submit"),
        handler,
        componentName,
        filePath,
        route,
        lineNumber,
        confidence: 0.92,
        detectionMethod: "jsx_form_submit",
        metadata: { tagName, fileName },
      });
      return;
    }

    // ── Next.js Link / anchor navigation ────────────────────
    if (tagName === "Link" || tagName === "a") {
      const href = getJsxAttrString(opening, "href");
      if (!href) return;
      // Skip external links
      if (href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("#")) return;

      const jsxText = getJsxTextContent(fullNode);
      const ariaLabel = getJsxAttrString(opening, "aria-label");
      const label = extractLabel(jsxText, ariaLabel, undefined, undefined, undefined, undefined, href);
      const isNextLink = tagName === "Link";

      result.interactions.push({
        type: "navigation",
        label: label || href,
        eventName: generateEventName(label, "", "navigation"),
        handler: "",
        componentName,
        filePath,
        route,
        lineNumber,
        confidence: isNextLink ? 0.95 : 0.85,
        detectionMethod: isNextLink ? "jsx_next_link" : "jsx_link_href",
        metadata: { href, tagName, fileName },
      });
      return;
    }

    // ── Input interactions ───────────────────────────────────
    if (tagName === "input" || tagName === "Input") {
      const inputType = getJsxAttrString(opening, "type") || "text";
      // Skip hidden inputs
      if (inputType === "hidden") return;

      const onChange = getJsxAttrString(opening, "onChange");
      const onBlur = getJsxAttrString(opening, "onBlur");
      const onFocus = getJsxAttrString(opening, "onFocus");
      const name = getJsxAttrString(opening, "name");
      const placeholder = getJsxAttrString(opening, "placeholder");
      const ariaLabel = getJsxAttrString(opening, "aria-label");
      const id = getJsxAttrString(opening, "id");

      // Only emit if there's at least one handler
      if (!onChange && !onBlur && !onFocus) return;

      const label = extractLabel(undefined, ariaLabel, placeholder, name, id, undefined, componentName);

      // Checkbox / Radio
      if (inputType === "checkbox" || inputType === "radio") {
        const handler = extractHandlerName(onChange);
        result.interactions.push({
          type: inputType === "checkbox" ? "checkbox_change" : "selection_change",
          label: label || (inputType === "checkbox" ? "Checkbox" : "Radio"),
          eventName: generateEventName(label, handler, "checkbox_change"),
          handler,
          componentName,
          filePath,
          route,
          lineNumber,
          confidence: 0.88,
          detectionMethod: "jsx_checkbox_handler",
          metadata: { inputType, name, fileName },
        });
        return;
      }

      // Text / email / password inputs
      if (onChange) {
        const handler = extractHandlerName(onChange);
        result.interactions.push({
          type: "input_change",
          label: label || "Input Field",
          eventName: generateEventName(label, handler, "input_change"),
          handler,
          componentName,
          filePath,
          route,
          lineNumber,
          confidence: 0.82,
          detectionMethod: "jsx_input_handler",
          metadata: { inputType, name, fileName },
        });
      }
      return;
    }

    // ── Textarea ─────────────────────────────────────────────
    if (tagName === "textarea" || tagName === "Textarea") {
      const onChange = getJsxAttrString(opening, "onChange");
      if (!onChange) return;
      const name = getJsxAttrString(opening, "name");
      const placeholder = getJsxAttrString(opening, "placeholder");
      const handler = extractHandlerName(onChange);
      const label = extractLabel(undefined, undefined, placeholder, name, undefined, handler, componentName);

      result.interactions.push({
        type: "input_change",
        label: label || "Text Area",
        eventName: generateEventName(label, handler, "input_change"),
        handler,
        componentName,
        filePath,
        route,
        lineNumber,
        confidence: 0.80,
        detectionMethod: "jsx_input_handler",
        metadata: { tagName, name, fileName },
      });
      return;
    }

    // ── Select / Dropdown ────────────────────────────────────
    if (tagName === "select" || tagName === "Select" || tagName === "SelectTrigger") {
      const onChange = getJsxAttrString(opening, "onChange") || getJsxAttrString(opening, "onValueChange");
      if (!onChange) return;
      const name = getJsxAttrString(opening, "name");
      const handler = extractHandlerName(onChange);
      const label = extractLabel(undefined, undefined, undefined, name, undefined, handler, componentName);

      result.interactions.push({
        type: "selection_change",
        label: label || "Select",
        eventName: generateEventName(label, handler, "selection_change"),
        handler,
        componentName,
        filePath,
        route,
        lineNumber,
        confidence: 0.85,
        detectionMethod: "jsx_select_handler",
        metadata: { tagName, name, fileName },
      });
      return;
    }

    // ── Tabs ─────────────────────────────────────────────────
    if (tagName === "Tabs" || tagName === "TabsTrigger" || tagName === "TabTrigger") {
      const onValueChange = getJsxAttrString(opening, "onValueChange") || getJsxAttrString(opening, "onChange");
      if (!onValueChange) return;
      const handler = extractHandlerName(onValueChange);
      const jsxText = getJsxTextContent(fullNode);
      const label = extractLabel(jsxText, undefined, undefined, undefined, undefined, handler, componentName);

      result.interactions.push({
        type: "tab_change",
        label: label || "Tab",
        eventName: generateEventName(label, handler, "tab_change"),
        handler,
        componentName,
        filePath,
        route,
        lineNumber,
        confidence: 0.85,
        detectionMethod: "jsx_tab_handler",
        metadata: { tagName, fileName },
      });
      return;
    }

    // ── Modal / Dialog state ─────────────────────────────────
    if (/modal|dialog|drawer|sheet/i.test(tagName)) {
      const onOpen = getJsxAttrString(opening, "onOpen") || getJsxAttrString(opening, "onOpenChange");
      const onClose = getJsxAttrString(opening, "onClose");
      const open = getJsxAttrString(opening, "open");

      const hasHandler = onOpen || onClose;
      if (!hasHandler) return;

      const handler = extractHandlerName(onOpen || onClose || "");
      const jsxText = getJsxTextContent(fullNode);
      const label = extractLabel(jsxText, undefined, undefined, undefined, undefined, handler, tagName);

      result.interactions.push({
        type: onClose ? "modal_close" : "modal_open",
        label: label || tagName,
        eventName: generateEventName(label, handler, onClose ? "modal_close" : "modal_open"),
        handler,
        componentName,
        filePath,
        route,
        lineNumber,
        confidence: 0.75,
        detectionMethod: "jsx_modal_handler",
        metadata: { tagName, open, fileName },
      });
      return;
    }

    // ── Generic: Any JSX with onClick ────────────────────────
    const onClickValue = getJsxAttrString(opening, "onClick");
    if (onClickValue && /^[A-Z]/.test(tagName)) {
      const handler = extractHandlerName(onClickValue);
      const jsxText = getJsxTextContent(fullNode);
      const ariaLabel = getJsxAttrString(opening, "aria-label");
      const label = extractLabel(jsxText, ariaLabel, undefined, undefined, undefined, handler, componentName);
      let type: InteractionType = "button_click";
      type = classifyInteractionType(type, label, handler, tagName);

      result.interactions.push({
        type,
        label: label || tagName,
        eventName: generateEventName(label, handler, type),
        handler,
        componentName,
        filePath,
        route,
        lineNumber,
        confidence: 0.72,
        detectionMethod: "custom_component_handler",
        metadata: { tagName, fileName },
      });
    }
  } catch { /* skip malformed JSX nodes */ }
}

// ── Router Navigation Detection ──────────────────────────────

function detectRouterNavigation(
  sourceFile: ReturnType<typeof Project.prototype.createSourceFile>,
  filePath: string,
  route: string,
  result: ParsedFileResult
): void {
  try {
    // Detect router.push("...") and router.replace("...")
    sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((call) => {
      try {
        const expr = call.getExpression();
        const callText = expr.getText();

        if (!/router\.(push|replace)|navigate\(|useNavigate/.test(callText)) return;

        const args = call.getArguments();
        if (args.length === 0) return;

        const firstArg = args[0];
        let target = "";
        if (Node.isStringLiteral(firstArg)) {
          target = firstArg.getLiteralValue();
        } else {
          target = firstArg.getText().replace(/['"]/g, "").trim();
        }

        if (!target || target.startsWith("http")) return;

        const componentName = getContainingComponentName(call);
        const lineNumber = call.getStartLineNumber();
        const method = callText.includes("replace") ? "router.replace" : "router.push";

        result.interactions.push({
          type: "navigation",
          label: target,
          eventName: generateEventName(target, "", "navigation"),
          handler: method,
          componentName,
          filePath,
          route,
          lineNumber,
          confidence: 0.88,
          detectionMethod: "router_push",
          metadata: { target, method, fileName: filePath.split("/").pop() },
        });
      } catch { /* skip */ }
    });
  } catch { /* skip */ }
}

// ── Batch Analysis ───────────────────────────────────────────

export interface BatchAnalysisInput {
  path: string;
  content: string;
}

/**
 * Analyzes multiple files and returns aggregated results.
 * Safe — never throws on individual file errors.
 */
export function analyzeFiles(files: BatchAnalysisInput[]): ParsedFileResult[] {
  return files.map(({ path, content }) => {
    try {
      return parseFile(path, content);
    } catch (e: any) {
      return {
        filePath: path,
        success: false,
        error: e?.message || "Unknown parse error",
        route: detectRouteFromPath(path),
        components: [],
        interactions: [],
      };
    }
  });
}
