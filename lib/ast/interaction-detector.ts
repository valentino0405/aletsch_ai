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
import { sanitizeForLLM } from "../security/secret-filter";

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

// ── Helper: extract JSX attribute value ─────────────────────

const accessibleNames = new WeakMap<Node, Map<string, string>>();
function relatedAccessibleName(element: JsxOpeningElement | JsxSelfClosingElement): string | undefined {
  const source = element.getSourceFile();
  let names = accessibleNames.get(source);
  if (!names) {
    names = new Map();
    for (const jsx of source.getDescendantsOfKind(SyntaxKind.JsxElement)) {
      const opening = jsx.getOpeningElement();
      const id = getJsxAttrString(opening, "id");
      if (id) names.set("id:" + id, getJsxTextContent(jsx));
      if (opening.getTagNameNode().getText() === "label") {
        const target = getJsxAttrString(opening, "htmlFor");
        if (target) names.set("for:" + target, getJsxTextContent(jsx));
      }
    }
    accessibleNames.set(source, names);
  }
  const labelledBy = getJsxAttrString(element, "aria-labelledby");
  const referenced = labelledBy?.split(/\s+/).map(id => names!.get("id:" + id) ?? "").filter(Boolean).join(" ");
  if (referenced) return referenced;
  const id = getJsxAttrString(element, "id");
  if (id && names.has("for:" + id)) return names.get("for:" + id);
  const label = element.getAncestors().find(node => Node.isJsxElement(node) && node.getOpeningElement().getTagNameNode().getText() === "label");
  return label ? getJsxTextContent(label) : undefined;
}

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
        if (expr.getKind() === SyntaxKind.NullKeyword || expr.getKind() === SyntaxKind.FalseKeyword || expr.getText() === "undefined") return undefined;
        return expr.getText().trim();
      }
    }
  } catch { /* ignore */ }
  return attrName === "aria-label" ? relatedAccessibleName(element) : undefined;
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
      if (Node.isJsxExpression(child) && !child.getFirstAncestorByKind(SyntaxKind.JsxAttribute)) {
        const expression = child.getExpression();
        if (expression && Node.isStringLiteral(expression)) texts.push(expression.getLiteralValue());
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
        if (!name && current.isDefaultExport()) return defaultComponentName(node);
      }
      if (Node.isVariableDeclaration(current) && /^[A-Z]/.test(current.getName())) return current.getName();
      if (Node.isClassDeclaration(current) && current.getName()) return current.getName()!;
      if (Node.isExportAssignment(current)) return defaultComponentName(node);
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
  // Business meaning belongs to the semantic classifier, never the AST type.
  return baseType;
}

function defaultComponentName(node: Node): string {
  const base = node.getSourceFile().getBaseNameWithoutExtension().replace(/[^A-Za-z0-9_$]/g, "_");
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function containsJsx(node: Node): boolean {
  return node.getDescendants().some(child => Node.isJsxElement(child) || Node.isJsxSelfClosingElement(child) || Node.isJsxFragment(child));
}

function handlerExpression(element: JsxOpeningElement | JsxSelfClosingElement, attribute: string): Node | undefined {
  const attr = element.getAttribute(attribute);
  if (!attr || !Node.isJsxAttribute(attr)) return undefined;
  const initializer = attr.getInitializer();
  let expression: Node | undefined = initializer && Node.isJsxExpression(initializer) ? initializer.getExpression() : undefined;
  // Re-analysis must inspect the application's handler, not our wrapper.
  const trackerNames = new Set(element.getSourceFile().getImportDeclarations().flatMap(declaration => declaration.getNamedImports().filter(named => named.getName() === "trackEvent").map(named => named.getAliasNode()?.getText() ?? named.getName())));
  while (expression && Node.isCallExpression(expression) && (trackerNames.has(expression.getExpression().getText()) || /(?:^|\.)\w*trackEvent$/i.test(expression.getExpression().getText()))) {
    expression = expression.getArguments()[2];
  }
  return expression;
}

function semanticContext(element: JsxOpeningElement | JsxSelfClosingElement, attribute: string, componentName: string) {
  let expression = handlerExpression(element, attribute);
  if (expression && Node.isIdentifier(expression)) {
    const definition = expression.getDefinitionNodes().find(node => Node.isFunctionDeclaration(node) || Node.isVariableDeclaration(node) || Node.isMethodDeclaration(node));
    if (definition) expression = definition;
  }
  if (expression && Node.isPropertyAccessExpression(expression)) {
    const definition = expression.getNameNode().getSymbol()?.getDeclarations().find(node => Node.isMethodDeclaration(node) || Node.isPropertyDeclaration(node));
    if (definition) expression = definition;
  }
  const source = expression?.getText() ?? "";
  const calls = expression?.getDescendantsOfKind(SyntaxKind.CallExpression) ?? [];
  if (expression && Node.isCallExpression(expression)) calls.unshift(expression);
  const navigation = calls.find(call => /(?:^navigate$|(?:router|navigation)\.(?:push|replace)$)/.test(call.getExpression().getText()));
  const target = navigation?.getArguments()[0];
  const form = element.getAncestors().find(node => Node.isJsxElement(node) && /^(form|Form)$/.test(node.getOpeningElement().getTagNameNode().getText()));
  const formOpening = form && Node.isJsxElement(form) ? form.getOpeningElement() : undefined;
  const fields = form?.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).filter(node => /^(input|Input|textarea|Textarea|select|Select)$/.test(node.getTagNameNode().getText())).map(node => ({
    name: getJsxAttrString(node, "name") ?? "", type: getJsxAttrString(node, "type") ?? "text", placeholder: getJsxAttrString(node, "placeholder") ?? "",
  })) ?? [];
  return {
    handlerSource: sanitizeForLLM(source, 1000),
    calledFunctions: [...new Set(calls.map(call => sanitizeForLLM(call.getExpression().getText(), 100)))].slice(0, 12),
    navigationTarget: target && Node.isStringLiteral(target) ? sanitizeForLLM(target.getLiteralValue().split(/[?#]/)[0], 120) : undefined,
    formContext: formOpening ? { componentName, name: getJsxAttrString(formOpening, "aria-label") ?? getJsxAttrString(formOpening, "name") ?? componentName, handler: getJsxAttrString(formOpening, "onSubmit") ?? "", fields } : undefined,
    ariaLabel: getJsxAttrString(element, "aria-label"), placeholder: getJsxAttrString(element, "placeholder"),
  };
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
export function parseFile(filePath: string, content: string, sharedProject?: Project): ParsedFileResult {
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
    project = sharedProject ?? new Project({
      useInMemoryFileSystem: true,
      skipLoadingLibFiles: true,
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
    const diagnostics = project.getProgram().getSyntacticDiagnostics(sourceFile);
    if (diagnostics.length) {
      result.error = diagnostics.map(d => `TS${d.getCode()}: ${d.getMessageText()}`).join("; ");
      return result;
    }
  } catch (e: any) {
    result.error = `Source file parse failed: ${e?.message}`;
    return result;
  }

  try {
    // ── 1. Detect React component functions ─────────────────
    detectComponents(sourceFile, filePath, route, result);

    // ── 2. Detect all JSX elements ──────────────────────────
    detectJsxInteractions(sourceFile, filePath, route, result);

    // Router calls enrich their owning JSX handler; declarations/effects
    // are not additional user interactions or separate injection sites.
    for (const component of result.components) component.interactionCount = result.interactions.filter(i => i.componentName === component.name).length;

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
  sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration).forEach((fn) => {
    const name = fn.getName() ?? (fn.isDefaultExport() ? defaultComponentName(fn) : "");
    if (!name || !/^[A-Z]/.test(name) || !containsJsx(fn)) return;
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
  sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration).forEach((decl) => {
    const name = decl.getName();
    if (!name || !/^[A-Z]/.test(name)) return;
    const init = decl.getInitializer();
    if (!init) return;
    if (Node.isArrowFunction(init) || Node.isFunctionExpression(init) || (Node.isCallExpression(init) && /(?:^|\.)(?:memo|forwardRef)$/.test(init.getExpression().getText()))) {
      // Check it returns JSX
      if (!containsJsx(init)) return;
      result.components.push({
        name,
        filePath,
        route,
        lineNumber: decl.getStartLineNumber(),
        isDefaultExport: sourceFile.getExportAssignments().some(e => e.getExpression().getText() === name),
        interactionCount: 0,
      });
    }
  });
  sourceFile.getClasses().forEach(cls => {
    if (!cls.getMethod("render") || !containsJsx(cls)) return;
    result.components.push({ name: cls.getName() ?? defaultComponentName(cls), filePath, route, lineNumber: cls.getStartLineNumber(), isDefaultExport: cls.isDefaultExport(), interactionCount: 0 });
  });
  sourceFile.getExportAssignments().forEach(assignment => {
    const expression = assignment.getExpression();
    if ((Node.isArrowFunction(expression) || Node.isFunctionExpression(expression)) && containsJsx(expression)) {
      result.components.push({ name: defaultComponentName(assignment), filePath, route, lineNumber: assignment.getStartLineNumber(), isDefaultExport: true, interactionCount: 0 });
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
  const positions = new Map(sourceFile.getDescendants().filter(n => Node.isJsxOpeningElement(n) || Node.isJsxSelfClosingElement(n)).map((node, index) => [node.getStart(), index]));

  // Process JsxElements (open + close tags)
  sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement).forEach((jsxEl) => {
    const opening = jsxEl.getOpeningElement();
    processJsxElement(opening, jsxEl, filePath, route, fileName, result, positions.get(opening.getStart()) ?? 0);
  });

  // Process JsxSelfClosingElements (<Input onChange={...} />)
  sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).forEach((jsxEl) => {
    processJsxElement(jsxEl, jsxEl, filePath, route, fileName, result, positions.get(jsxEl.getStart()) ?? 0);
  });
}

function processJsxElement(
  opening: JsxOpeningElement | JsxSelfClosingElement,
  fullNode: Node,
  filePath: string,
  route: string,
  fileName: string,
  result: ParsedFileResult,
  jsxIndex: number
): void {
  try {
    const tagName = opening.getTagNameNode().getText();
    const lineNumber = opening.getStartLineNumber();
    const componentName = getContainingComponentName(opening);
    if (getJsxAttrString(opening, "disabled") === "true" || getJsxAttrString(opening, "aria-disabled") === "true") return;
    const column = sourceFileColumn(opening);
    const emit = (interaction: DetectedInteraction, attribute?: string) => {
      const handlerAttribute = attribute ?? ({ form_submit: "onSubmit", input_change: "onChange", input_focus: "onFocus", input_blur: "onBlur", selection_change: getJsxAttrString(opening, "onValueChange") ? "onValueChange" : "onChange", checkbox_change: "onChange", tab_change: getJsxAttrString(opening, "onValueChange") ? "onValueChange" : "onChange", modal_open: getJsxAttrString(opening, "onOpenChange") ? "onOpenChange" : "onOpen", modal_close: "onClose" } as Partial<Record<InteractionType, string>>)[interaction.type] ?? "onClick";
      result.interactions.push({ ...interaction, metadata: { ...interaction.metadata, tagName, fileName, sourceColumn: column, elementIndex: jsxIndex, handlerAttribute,
        siteId: `${filePath}::${componentName}::${jsxIndex}::${handlerAttribute}`, ...semanticContext(opening, handlerAttribute, componentName) } });
    };

    // Keyboard handlers may coexist with pointer/value callbacks.
    for (const attribute of ["onKeyDown", "onKeyUp", "onKeyPress"]) {
      const value = getJsxAttrString(opening, attribute);
      if (!value) continue;
      const handler = extractHandlerName(value);
      const label = extractLabel(getJsxTextContent(fullNode), getJsxAttrString(opening, "aria-label"), undefined, undefined, undefined, handler, componentName);
      emit({ type: "keyboard_interaction", label, eventName: generateEventName(label, handler, "keyboard_interaction"), handler, componentName, filePath, route, lineNumber, confidence: 0.9, detectionMethod: "jsx_keyboard_handler" }, attribute);
    }

    // ── Button interactions ──────────────────────────────────
    if (BUTTON_TAGS.has(tagName) || BUTTON_LIKE_NAME_PATTERNS.some((p) => p.test(tagName))) {
      const onClickValue = getJsxAttrString(opening, "onClick");
      const typeAttr = getJsxAttrString(opening, "type");
      const ariaLabel = getJsxAttrString(opening, "aria-label");
      const title = getJsxAttrString(opening, "title");
      const jsxText = getJsxTextContent(fullNode);
      const handler = extractHandlerName(onClickValue);

      // Only emit if there's a handler OR readable text
      if (!BUTTON_TAGS.has(tagName) && !onClickValue) return;
      if (!onClickValue && !jsxText && !ariaLabel) return;
      const parentForm = opening.getAncestors().some(n => Node.isJsxElement(n) && n.getOpeningElement().getTagNameNode().getText() === "form");
      if (tagName === "button" && parentForm && typeAttr !== "button" && typeAttr !== "reset" && !onClickValue) return;

      const label = extractLabel(jsxText, ariaLabel, title, undefined, undefined, handler, componentName);
      let interactionType: InteractionType = "button_click";
      interactionType = classifyInteractionType(interactionType, label, handler, tagName);

      const confidence = BUTTON_TAGS.has(tagName)
        ? onClickValue ? 0.97 : 0.80
        : 0.75;

      const detectionMethod: DetectionMethod = BUTTON_TAGS.has(tagName)
        ? "jsx_button_handler"
        : "custom_component_handler";

      emit({
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

      emit({
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
      if (/^(?:javascript|data|mailto|tel):/i.test(href)) return;

      const jsxText = getJsxTextContent(fullNode);
      const ariaLabel = getJsxAttrString(opening, "aria-label");
      const label = extractLabel(jsxText, ariaLabel, undefined, undefined, undefined, undefined, href);
      const isNextLink = tagName === "Link";

      emit({
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
      for (const [attribute, type] of [["onFocus", "input_focus"], ["onBlur", "input_blur"]] as const) {
        const value = getJsxAttrString(opening, attribute);
        if (value) emit({ type, label, eventName: `${generateEventName(label, extractHandlerName(value), type)}_${type === "input_focus" ? "focused" : "blurred"}`, handler: extractHandlerName(value), componentName, filePath, route, lineNumber, confidence: 0.85, detectionMethod: "jsx_input_handler" }, attribute);
      }

      // Checkbox / Radio
      if (inputType === "checkbox" || inputType === "radio") {
        if (!onChange) return;
        const handler = extractHandlerName(onChange);
        emit({
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
        emit({
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

      emit({
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
    if (tagName === "select" || /^(Select|SelectTrigger|Dropdown|Accordion)$/.test(tagName)) {
      const onChange = getJsxAttrString(opening, "onChange") || getJsxAttrString(opening, "onValueChange");
      if (!onChange) return;
      const name = getJsxAttrString(opening, "name");
      const handler = extractHandlerName(onChange);
      const label = extractLabel(undefined, undefined, undefined, name, undefined, handler, componentName);

      emit({
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

      emit({
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

      for (const [attribute, type] of [[onOpen ? (getJsxAttrString(opening, "onOpenChange") ? "onOpenChange" : "onOpen") : "", "modal_open"], [onClose ? "onClose" : "", "modal_close"]] as const) {
      if (!attribute) continue;
      const value = getJsxAttrString(opening, attribute);
      emit({
        type,
        label: label || tagName,
        eventName: type,
        handler: extractHandlerName(value),
        componentName,
        filePath,
        route,
        lineNumber,
        confidence: 0.75,
        detectionMethod: "jsx_modal_handler",
        metadata: { tagName, open, fileName },
      }, attribute);
      }
      return;
    }

    // ── Generic: Any JSX with onClick ────────────────────────
    const onClickValue = getJsxAttrString(opening, "onClick");
    if (onClickValue) {
      const handler = extractHandlerName(onClickValue);
      const jsxText = getJsxTextContent(fullNode);
      const ariaLabel = getJsxAttrString(opening, "aria-label");
      const label = extractLabel(jsxText, ariaLabel, undefined, undefined, undefined, handler, componentName);
      let type: InteractionType = "button_click";
      type = classifyInteractionType(type, label, handler, tagName);

      emit({
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

function sourceFileColumn(node: Node): number {
  return node.getSourceFile().getLineAndColumnAtPos(node.getStart()).column;
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
  const project = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true, compilerOptions: { jsx: 4, allowJs: true, moduleResolution: 2, target: 99 } });
  for (const file of files) if (/\.(tsx|jsx|ts|js)$/.test(file.path)) project.createSourceFile(file.path, file.content, { overwrite: true });
  return files.map(({ path, content }) => {
    try {
      return parseFile(path, content, project);
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
