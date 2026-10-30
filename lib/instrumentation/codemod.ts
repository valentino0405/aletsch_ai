// ============================================================
// Aletsch AI — Instrumentation codemod
// ------------------------------------------------------------
// Rewrites source files with ts-morph to emit analytics events.
//
// This is an AST transform, not a string replacement: handlers are
// wrapped as expressions, so arguments, `this`, return values and
// async behaviour are all preserved. Anything that cannot be
// transformed safely is skipped with a reason the developer can read,
// never silently mangled.
//
// The repository is untrusted input. Nothing here executes it — the
// files are parsed in an in-memory filesystem and printed back out.
// ============================================================

import { Project, SyntaxKind, Node, type JsxOpeningElement, type JsxSelfClosingElement } from "ts-morph";
import type { InteractionType } from "@/lib/ast/types";
import type { FrameworkDetection } from "@/lib/ingestion/framework-detector";
import { trackerImportSpecifier } from "./tracker-template";

export interface InstrumentationTarget {
  eventName: string;
  /** 1-based line of the JSX opening element, from the AST pass. */
  lineNumber: number;
  tagName: string;
  interactionType: InteractionType;
  componentName: string;
  label: string;
  /** Literal properties baked into the generated call. */
  properties: Record<string, string>;
  /** Structural location and actual event prop supplied by the AST pass. */
  sourceColumn?: number;
  elementIndex?: number;
  handlerAttribute?: string;
}

export type SkipCode =
  | "element_not_found"
  | "already_instrumented"
  | "server_component"
  | "unsupported_initializer"
  | "spread_handler"
  | "no_handler_slot";

export interface AppliedEdit {
  eventName: string;
  lineNumber: number;
  attribute: string;
  sourceColumn?: number;
  mode: "wrapped_existing_handler" | "added_handler";
}

export interface SkippedEdit {
  eventName: string;
  lineNumber: number;
  code: SkipCode;
  reason: string;
}

export interface FileInstrumentationResult {
  filePath: string;
  originalContent: string;
  instrumentedContent: string;
  applied: AppliedEdit[];
  skipped: SkippedEdit[];
  /** True when the file was left byte-identical. */
  unchanged: boolean;
  error?: string;
}

/** Which JSX prop carries the handler for a given interaction. */
const ATTRIBUTE_BY_TYPE: Partial<Record<InteractionType, string>> = {
  form_submit: "onSubmit",
  input_change: "onChange",
  input_focus: "onFocus",
  input_blur: "onBlur",
  checkbox_change: "onChange",
  selection_change: "onChange",
  tab_change: "onValueChange",
  modal_open: "onOpenChange",
  modal_close: "onClose",
};

/** Candidate props, in preference order, for this element. */
function handlerAttributeCandidates(target: InstrumentationTarget): string[] {
  if (target.handlerAttribute && /^on[A-Z][A-Za-z]*$/.test(target.handlerAttribute)) return [target.handlerAttribute];
  const tag = target.tagName;

  if (target.interactionType === "form_submit" && /^(form|Form)$/.test(tag)) return ["onSubmit"];
  if (target.interactionType === "form_submit") return ["onClick", "onSubmit"];
  if (target.interactionType === "selection_change") return ["onChange", "onValueChange"];
  if (target.interactionType === "tab_change") return ["onValueChange", "onChange"];
  if (target.interactionType === "modal_open" || target.interactionType === "modal_close") {
    return ["onOpenChange", "onOpen", "onClose"];
  }

  const mapped = ATTRIBUTE_BY_TYPE[target.interactionType];
  return mapped ? [mapped, "onClick"] : ["onClick"];
}

/** Attaching a *new* handler to these is safe and does not alter layout. */
function canAddHandler(target: InstrumentationTarget): boolean {
  return (
    target.interactionType === "button_click" ||
    target.interactionType === "navigation" ||
    target.interactionType === "authentication" ||
    target.interactionType === "repository_connection"
    || target.interactionType === "form_submit"
  );
}

// ────────────────────────────────────────────────────────────
// Element lookup
// ────────────────────────────────────────────────────────────

interface JsxCandidate {
  element: JsxOpeningElement | JsxSelfClosingElement;
  line: number;
  tag: string;
  used: boolean;
  column: number;
  usedAttributes: Set<string>;
}

function collectJsxCandidates(sourceFile: ReturnType<Project["createSourceFile"]>): JsxCandidate[] {
  const candidates: JsxCandidate[] = [];

  const push = (element: JsxOpeningElement | JsxSelfClosingElement) => {
    try {
      candidates.push({
        element,
        line: element.getStartLineNumber(),
        tag: element.getTagNameNode().getText(),
        used: false,
        column: element.getSourceFile().getLineAndColumnAtPos(element.getStart()).column,
        usedAttributes: new Set(),
      });
    } catch {
      /* malformed node — ignore */
    }
  };

  sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement).forEach((el) => push(el.getOpeningElement()));
  sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).forEach(push);

  return candidates.sort((a, b) => a.element.getStart() - b.element.getStart());
}

/**
 * Finds the element a target refers to.
 *
 * Exact line + tag is the normal path. The tolerant fallbacks exist
 * because analysis and instrumentation can be minutes apart, and a
 * whitespace-only edit upstream should not silently drop an event.
 */
function findElement(candidates: JsxCandidate[], target: InstrumentationTarget): JsxCandidate | null {
  const available = (c: JsxCandidate) => !c.usedAttributes.has(handlerAttributeCandidates(target)[0]);
  const positioned = candidates.find(c => c.line === target.lineNumber && c.tag === target.tagName && target.sourceColumn === c.column);
  if (positioned) return available(positioned) ? positioned : null;
  const exact = candidates.filter((c) => available(c) && c.line === target.lineNumber && c.tag === target.tagName);
  if (exact.length === 1 && target.sourceColumn === undefined) return exact[0];
  if (exact.length > 1) return null;

  const nearby = candidates
    .filter((c) => available(c) && c.tag === target.tagName && Math.abs(c.line - target.lineNumber) <= 3)
    .sort((a, b) => Math.abs(a.line - target.lineNumber) - Math.abs(b.line - target.lineNumber));
  if (nearby.length === 1) return nearby[0];
  if (nearby.length > 1) return null;

  const sameTag = candidates.filter((c) => available(c) && c.tag === target.tagName);
  if (sameTag.length === 1) return sameTag[0];

  return null;
}

// ────────────────────────────────────────────────────────────
// Code generation helpers
// ────────────────────────────────────────────────────────────

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Renders the literal property bag passed to `trackEvent`. */
function renderProperties(properties: Record<string, string>): string {
  const entries = Object.entries(properties)
    .filter(([, value]) => typeof value === "string" && value.length > 0)
    .map(([key, value]) => {
      const name = IDENTIFIER.test(key) ? key : JSON.stringify(key);
      return `${name}: ${JSON.stringify(value.slice(0, 120))}`;
    });
  return entries.length > 0 ? `{ ${entries.join(", ")} }` : "{}";
}

function renderCall(target: InstrumentationTarget, existingExpression?: string, localName = "trackEvent"): string {
  const properties = renderProperties(target.properties);
  const args = [JSON.stringify(target.eventName), properties];
  if (existingExpression) args.push(existingExpression);
  return `${localName}(${args.join(", ")})`;
}

/** True when this element (or its file) already routes through Aletsch. */
function alreadyInstrumented(text: string, eventName: string): boolean {
  return text.includes("trackEvent(") && text.includes(JSON.stringify(eventName));
}

// ────────────────────────────────────────────────────────────
// Server-component safety
// ────────────────────────────────────────────────────────────

function hasUseClientDirective(content: string): boolean {
  // The directive must be the first statement, so only the head of the
  // file matters — a "use client" string deeper in is not a directive.
  const head = content.slice(0, 400);
  return /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["']use client["']/.test(head);
}

/**
 * In the Next.js App Router a module without `"use client"` is a Server
 * Component, and attaching an event handler to one is a build error.
 *
 * Wrapping a handler that is *already there* is always safe: the file
 * must already be a client module or the user's own build would fail.
 * Adding a brand-new handler is not, so it is skipped rather than
 * guessing that flipping the file to a client component is acceptable.
 */
function requiresClientDirective(framework: FrameworkDetection): boolean {
  return (
    framework.framework === "nextjs-app-router" ||
    framework.framework === "nextjs-hybrid" ||
    framework.framework === "remix"
  );
}

// ────────────────────────────────────────────────────────────
// Import management
// ────────────────────────────────────────────────────────────

function ensureTrackerImport(
  sourceFile: ReturnType<Project["createSourceFile"]>,
  specifier: string,
  localName = "trackEvent"
): void {
  const existing = sourceFile
    .getImportDeclarations()
    .find((declaration) => declaration.getModuleSpecifierValue() === specifier);

  if (existing) {
    if (existing.isTypeOnly()) {
      existing.setIsTypeOnly(false);
      existing.getNamedImports().forEach(named => named.setIsTypeOnly(named.getName() !== "trackEvent"));
    }
    existing.getNamedImports().find(named => named.getName() === "trackEvent")?.setIsTypeOnly(false);
    const named = existing.getNamedImports().map((n) => n.getName());
    if (!named.includes("trackEvent")) existing.addNamedImport({ name: "trackEvent", alias: localName === "trackEvent" ? undefined : localName });
    return;
  }

  // Insert after any leading directive prologue ("use client") and
  // after the existing imports, so the directive stays first.
  const statements = sourceFile.getStatements();
  let index = 0;
  while (index < statements.length) {
    const statement = statements[index];
    const isDirective =
      Node.isExpressionStatement(statement) && Node.isStringLiteral(statement.getExpression());
    if (!isDirective) break;
    index++;
  }
  while (index < statements.length && Node.isImportDeclaration(statements[index])) index++;

  sourceFile.insertImportDeclaration(index, {
    moduleSpecifier: specifier,
    namedImports: [{ name: "trackEvent", alias: localName === "trackEvent" ? undefined : localName }],
  });
}

function trackerBinding(sourceFile: ReturnType<Project["createSourceFile"]>, specifier: string): string {
  const existing = sourceFile.getImportDeclarations().find(d => d.getModuleSpecifierValue() === specifier);
  const named = existing?.getNamedImports().find(n => n.getName() === "trackEvent");
  if (named) return named.getAliasNode()?.getText() ?? "trackEvent";
  const taken = new Set(sourceFile.getDescendantsOfKind(SyntaxKind.Identifier).map(n => n.getText()));
  let name = "trackEvent", index = 1;
  while (taken.has(name)) name = index++ === 1 ? "aletschTrackEvent" : `aletschTrackEvent${index}`;
  return name;
}

// ────────────────────────────────────────────────────────────
// Main entry point
// ────────────────────────────────────────────────────────────

export interface CodemodOptions {
  framework: FrameworkDetection;
  /** Overrides the computed relative import (used by tests). */
  importSpecifier?: string;
}

/**
 * Instruments one file. Pure: takes source in, returns source out.
 * Never throws — failures are reported on the result.
 */
export function instrumentFile(
  filePath: string,
  content: string,
  targets: InstrumentationTarget[],
  options: CodemodOptions
): FileInstrumentationResult {
  const result: FileInstrumentationResult = {
    filePath,
    originalContent: content,
    instrumentedContent: content,
    applied: [],
    skipped: [],
    unchanged: true,
  };

  if (targets.length === 0) return result;

  let project: Project;
  let sourceFile: ReturnType<Project["createSourceFile"]>;
  try {
    project = new Project({
      useInMemoryFileSystem: true,
      skipLoadingLibFiles: true,
      compilerOptions: {
        jsx: 4, // JsxEmit.ReactJSX — matches the detection pass
        allowJs: true,
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        target: 99, // ESNext
      },
    });
    sourceFile = project.createSourceFile(filePath, content, { overwrite: true });
    const diagnostics = project.getProgram().getSyntacticDiagnostics(sourceFile);
    if (diagnostics.length) {
      result.error = `Source contains syntax errors: ${diagnostics.map(d => d.getCode()).join(", ")}`;
      return result;
    }
  } catch (error: any) {
    result.error = `Could not parse ${filePath}: ${error?.message ?? "unknown error"}`;
    return result;
  }

  const isClientModule = hasUseClientDirective(content) || !requiresClientDirective(options.framework);
  const candidates = collectJsxCandidates(sourceFile);
  const specifier = options.importSpecifier ?? trackerImportSpecifier(options.framework, filePath);
  const localName = trackerBinding(sourceFile, specifier);
  let mutated = false;
  const replacements: {start: number; end: number; text: string}[] = [];

  // Bottom-up, so an edit never shifts the line numbers of a target we
  // have not reached yet.
  const ordered = [...targets].sort((a, b) => b.lineNumber - a.lineNumber);

  for (const target of ordered) {
    const candidate = findElement(candidates, target);
    if (!candidate) {
      result.skipped.push({
        eventName: target.eventName,
        lineNumber: target.lineNumber,
        code: "element_not_found",
        reason: `No <${target.tagName}> found near line ${target.lineNumber}. The file has changed since it was analysed.`,
      });
      continue;
    }

    const element = candidate.element;

    try {
      const attributes = element.getAttributes();
      const hasSpread = attributes.some((attribute) => Node.isJsxSpreadAttribute(attribute));

      const named = attributes.filter(Node.isJsxAttribute);
      const preferences = handlerAttributeCandidates(target);
      const existing = named.find((attribute) => preferences.includes(attribute.getNameNode().getText()));

      if (existing) {
        if (attributes.slice(attributes.indexOf(existing) + 1).some(Node.isJsxSpreadAttribute)) {
          result.skipped.push({ eventName: target.eventName, lineNumber: target.lineNumber, code: "spread_handler", reason: "A trailing props spread may replace this handler at runtime." });
          continue;
        }
        const initializer = existing.getInitializer();
        const attributeName = existing.getNameNode().getText();

        if (!initializer || !Node.isJsxExpression(initializer)) {
          result.skipped.push({
            eventName: target.eventName,
            lineNumber: target.lineNumber,
            code: "unsupported_initializer",
            reason: `${attributeName} is not a JSX expression, so it cannot be wrapped safely.`,
          });
          continue;
        }

        const inner = initializer.getExpression();
        if (!inner) {
          result.skipped.push({
            eventName: target.eventName,
            lineNumber: target.lineNumber,
            code: "unsupported_initializer",
            reason: `${attributeName} is empty.`,
          });
          continue;
        }

        const innerText = inner.getText();
        const wrapped = Node.isCallExpression(inner) && inner.getExpression().getText() === localName;
        const originalHandler = wrapped ? inner.getArguments()[2]?.getText() : innerText;
        const desired = renderCall(target, originalHandler, localName);
        if ((wrapped && desired === innerText) || (!wrapped && alreadyInstrumented(innerText, target.eventName))) {
          result.skipped.push({
            eventName: target.eventName,
            lineNumber: target.lineNumber,
            code: "already_instrumented",
            reason: `${attributeName} already emits ${target.eventName}.`,
          });
          candidate.used = true;
          candidate.usedAttributes.add(attributeName);
          continue;
        }

        replacements.push({start: initializer.getStart(), end: initializer.getEnd(), text: `{${desired}}`});
        candidate.used = true;
        candidate.usedAttributes.add(attributeName);
        mutated = true;
        result.applied.push({
          eventName: target.eventName,
          lineNumber: target.lineNumber,
          attribute: attributeName,
          sourceColumn: candidate.column,
          mode: "wrapped_existing_handler",
        });
        continue;
      }

      // No handler present — we would be adding one.
      if (!canAddHandler(target)) {
        result.skipped.push({
          eventName: target.eventName,
          lineNumber: target.lineNumber,
          code: "no_handler_slot",
          reason: `<${target.tagName}> has no ${preferences[0]} to wrap, and adding one to a ${target.interactionType} element could change its behaviour.`,
        });
        continue;
      }

      if (!isClientModule) {
        result.skipped.push({
          eventName: target.eventName,
          lineNumber: target.lineNumber,
          code: "server_component",
          reason:
            'This file is a React Server Component. Event handlers cannot be attached to it — add "use client", or move this element into a client component, then re-run instrumentation.',
        });
        continue;
      }

      if (hasSpread) {
        // A later {...props} could overwrite the handler we add. Adding
        // ours after the spread is correct, and addAttribute appends,
        // so this is safe — but it is worth recording.
        result.skipped.push({
          eventName: target.eventName,
          lineNumber: target.lineNumber,
          code: "spread_handler",
          reason: `<${target.tagName}> spreads props, so a handler may be supplied at runtime. Add the tracking call by hand to be sure.`,
        });
        continue;
      }

      const insertAt = element.getEnd() - (Node.isJsxSelfClosingElement(element) ? 2 : 1);
      replacements.push({start: insertAt, end: insertAt, text: ` ${preferences[0]}={${renderCall(target, undefined, localName)}}`});
      candidate.used = true;
      candidate.usedAttributes.add(preferences[0]);
      mutated = true;
      result.applied.push({
        eventName: target.eventName,
        lineNumber: target.lineNumber,
        attribute: preferences[0],
        sourceColumn: candidate.column,
        mode: "added_handler",
      });
    } catch (error: any) {
      result.skipped.push({
        eventName: target.eventName,
        lineNumber: target.lineNumber,
        code: "unsupported_initializer",
        reason: `Could not rewrite this element: ${error?.message ?? "unknown error"}`,
      });
    }
  }

  if (!mutated) return result;

  try {
    // Every range comes from the original AST. Apply once, from right to left,
    // so ts-morph does not reparse the entire file for each event prop.
    let changed = content;
    for (const edit of replacements.sort((a,b) => b.start-a.start)) changed = changed.slice(0,edit.start)+edit.text+changed.slice(edit.end);
    sourceFile.replaceWithText(changed);
    ensureTrackerImport(sourceFile, specifier, localName);
    const output = sourceFile.getFullText();
    result.instrumentedContent = output;
    result.unchanged = output === content;
  } catch (error: any) {
    result.error = `Could not add the tracker import: ${error?.message ?? "unknown error"}`;
    result.instrumentedContent = content;
    result.unchanged = true;
    result.applied = [];
  }

  return result;
}

// ────────────────────────────────────────────────────────────
// Root layout / entry point wiring
// ────────────────────────────────────────────────────────────

export interface ProviderInjectionResult {
  content: string;
  injected: boolean;
  reason?: string;
}

/**
 * Mounts `<AletschAnalytics />` in the app's root layout so page views
 * are recorded without the developer wiring anything up.
 *
 * Inserted as the last child of <body> when present, otherwise as the
 * last child of the returned root element.
 */
export function injectProvider(
  layoutPath: string,
  layoutContent: string,
  providerImportSpecifier: string
): ProviderInjectionResult {
  const project = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true, compilerOptions: { jsx: 4, allowJs: true, target: 99 } });
  let sourceFile: ReturnType<Project["createSourceFile"]>;
  try {
    sourceFile = project.createSourceFile(layoutPath, layoutContent, { overwrite: true });
    if (project.getProgram().getSyntacticDiagnostics(sourceFile).length) return { content: layoutContent, injected: false, reason: "The layout contains syntax errors." };
  } catch (error) {
    return { content: layoutContent, injected: false, reason: "Could not parse the layout: " + String(error) };
  }
  const existingImport = sourceFile.getImportDeclarations().find(d => d.getModuleSpecifierValue() === providerImportSpecifier);
  const taken = new Set(sourceFile.getDescendantsOfKind(SyntaxKind.Identifier).map(n => n.getText()));
  let providerName = existingImport?.getDefaultImport()?.getText() ?? "AletschAnalytics";
  if (!existingImport?.getDefaultImport()) {
    let index = 1;
    while (taken.has(providerName)) providerName = "AletschAnalyticsProvider" + (index++ === 1 ? "" : index);
  }
  const defaultFunction = sourceFile.getFunctions().find(f => f.isDefaultExport())
    ?? sourceFile.getFunctions().find(f => /^(App|RootLayout|Root)$/.test(f.getName() ?? ""));
  const assignment = sourceFile.getExportAssignments()[0]?.getExpression();
  let root: Node | undefined;
  if (defaultFunction) {
    root = defaultFunction.getDescendantsOfKind(SyntaxKind.ReturnStatement)
      .find(r => r.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration) === defaultFunction)?.getExpression();
  } else if (assignment && (Node.isArrowFunction(assignment) || Node.isFunctionExpression(assignment))) {
    const body = assignment.getBody();
    root = Node.isBlock(body) ? body.getDescendantsOfKind(SyntaxKind.ReturnStatement)[0]?.getExpression() : body;
  } else if (assignment && Node.isIdentifier(assignment)) {
    const declaration = sourceFile.getVariableDeclaration(assignment.getText());
    const initializer = declaration?.getInitializer();
    if (initializer && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))) {
      const body = initializer.getBody();
      root = Node.isBlock(body) ? body.getDescendantsOfKind(SyntaxKind.ReturnStatement)[0]?.getExpression() : body;
    }
  }
  while (root && Node.isParenthesizedExpression(root)) root = root.getExpression();
  root ??= sourceFile.getDescendants().find(n => (Node.isJsxElement(n) || Node.isJsxSelfClosingElement(n) || Node.isJsxFragment(n)) && !n.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration));
  if (!root) return { content: layoutContent, injected: false, reason: "No supported JSX root found in the layout." };
  const allNodes = [root, ...root.getDescendants()];
  if (allNodes.some(n => (Node.isJsxOpeningElement(n) || Node.isJsxSelfClosingElement(n)) && n.getTagNameNode().getText() === providerName)) {
    return { content: layoutContent, injected: false, reason: "The layout already mounts AletschAnalytics." };
  }
  const body = allNodes.find(n => Node.isJsxElement(n) && n.getOpeningElement().getTagNameNode().getText() === "body");
  const host = body ?? root;
  let updated: string;
  if (Node.isJsxElement(host) || Node.isJsxFragment(host)) {
    const closing = Node.isJsxElement(host) ? host.getClosingElement() : host.getClosingFragment();
    updated = layoutContent.slice(0, closing.getStart()) + "<" + providerName + " />\n" + layoutContent.slice(closing.getStart());
  } else if (Node.isJsxSelfClosingElement(host)) {
    updated = layoutContent.slice(0, host.getStart()) + "<>" + host.getText() + "<" + providerName + " /></>" + layoutContent.slice(host.getEnd());
  } else return { content: layoutContent, injected: false, reason: "The root expression cannot be mounted safely." };
  try {
    const withChild = project.createSourceFile(layoutPath, updated, { overwrite: true });
    const existing = withChild.getImportDeclarations().find(d => d.getModuleSpecifierValue() === providerImportSpecifier);
    if (existing) {
      if (!existing.getDefaultImport()) existing.setDefaultImport(providerName);
    } else {
      const statements = withChild.getStatements();
      let index = 0;
      while (index < statements.length && Node.isExpressionStatement(statements[index]) && Node.isStringLiteral((statements[index] as import("ts-morph").ExpressionStatement).getExpression())) index++;
      while (index < statements.length && Node.isImportDeclaration(statements[index])) index++;
      withChild.insertImportDeclaration(index, { moduleSpecifier: providerImportSpecifier, defaultImport: providerName });
    }
    if (project.getProgram().getSyntacticDiagnostics(withChild).length) return { content: layoutContent, injected: false, reason: "Provider injection generated invalid syntax." };
    return { content: withChild.getFullText(), injected: true };
  } catch (error) {
    return { content: layoutContent, injected: false, reason: "Could not add the provider: " + String(error) };
  }
}
