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
  checkbox_change: "onChange",
  selection_change: "onChange",
  tab_change: "onValueChange",
  modal_open: "onOpenChange",
  modal_close: "onClose",
};

/** Candidate props, in preference order, for this element. */
function handlerAttributeCandidates(target: InstrumentationTarget): string[] {
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
      });
    } catch {
      /* malformed node — ignore */
    }
  };

  sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement).forEach((el) => push(el.getOpeningElement()));
  sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).forEach(push);

  return candidates;
}

/**
 * Finds the element a target refers to.
 *
 * Exact line + tag is the normal path. The tolerant fallbacks exist
 * because analysis and instrumentation can be minutes apart, and a
 * whitespace-only edit upstream should not silently drop an event.
 */
function findElement(candidates: JsxCandidate[], target: InstrumentationTarget): JsxCandidate | null {
  const exact = candidates.find((c) => !c.used && c.line === target.lineNumber && c.tag === target.tagName);
  if (exact) return exact;

  const nearby = candidates
    .filter((c) => !c.used && c.tag === target.tagName && Math.abs(c.line - target.lineNumber) <= 3)
    .sort((a, b) => Math.abs(a.line - target.lineNumber) - Math.abs(b.line - target.lineNumber));
  if (nearby.length > 0) return nearby[0];

  const sameTag = candidates.filter((c) => !c.used && c.tag === target.tagName);
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

function renderCall(target: InstrumentationTarget, existingExpression?: string): string {
  const properties = renderProperties(target.properties);
  const args = [JSON.stringify(target.eventName), properties];
  if (existingExpression) args.push(existingExpression);
  return `trackEvent(${args.join(", ")})`;
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
  specifier: string
): void {
  const existing = sourceFile
    .getImportDeclarations()
    .find((declaration) => declaration.getModuleSpecifierValue() === specifier);

  if (existing) {
    const named = existing.getNamedImports().map((n) => n.getName());
    if (!named.includes("trackEvent")) existing.addNamedImport("trackEvent");
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
    namedImports: ["trackEvent"],
  });
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
      compilerOptions: {
        jsx: 4, // JsxEmit.ReactJSX — matches the detection pass
        allowJs: true,
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        target: 99, // ESNext
      },
    });
    sourceFile = project.createSourceFile(filePath, content, { overwrite: true });
  } catch (error: any) {
    result.error = `Could not parse ${filePath}: ${error?.message ?? "unknown error"}`;
    return result;
  }

  const isClientModule = hasUseClientDirective(content) || !requiresClientDirective(options.framework);
  const candidates = collectJsxCandidates(sourceFile);
  let mutated = false;

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
        if (alreadyInstrumented(innerText, target.eventName)) {
          result.skipped.push({
            eventName: target.eventName,
            lineNumber: target.lineNumber,
            code: "already_instrumented",
            reason: `${attributeName} already emits ${target.eventName}.`,
          });
          candidate.used = true;
          continue;
        }

        existing.setInitializer(`{${renderCall(target, innerText)}}`);
        candidate.used = true;
        mutated = true;
        result.applied.push({
          eventName: target.eventName,
          lineNumber: target.lineNumber,
          attribute: attributeName,
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

      element.addAttribute({
        name: preferences[0],
        initializer: `{${renderCall(target)}}`,
      });
      candidate.used = true;
      mutated = true;
      result.applied.push({
        eventName: target.eventName,
        lineNumber: target.lineNumber,
        attribute: preferences[0],
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
    const specifier = options.importSpecifier ?? trackerImportSpecifier(options.framework, filePath);
    ensureTrackerImport(sourceFile, specifier);
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
  if (layoutContent.includes("AletschAnalytics")) {
    return { content: layoutContent, injected: false, reason: "The layout already mounts AletschAnalytics." };
  }

  let project: Project;
  let sourceFile: ReturnType<Project["createSourceFile"]>;
  try {
    project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { jsx: 4, allowJs: true, target: 99 },
    });
    sourceFile = project.createSourceFile(layoutPath, layoutContent, { overwrite: true });
  } catch (error: any) {
    return { content: layoutContent, injected: false, reason: `Could not parse the layout: ${error?.message}` };
  }

  const elements = sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement);
  if (elements.length === 0) {
    return { content: layoutContent, injected: false, reason: "No JSX element found in the layout." };
  }

  const body = elements.find((element) => element.getOpeningElement().getTagNameNode().getText() === "body");
  // Outermost element = the one with the fewest ancestors.
  const host =
    body ??
    elements.reduce((outermost, element) =>
      element.getAncestors().length < outermost.getAncestors().length ? element : outermost
    );

  // The child is spliced in at the closing tag's offset. That offset
  // comes from the AST rather than a regex, so it is exact.
  const insertOffset = host.getClosingElement().getStart();
  const closingIndent = " ".repeat(host.getIndentationLevel() * 2);
  const updated =
    layoutContent.slice(0, insertOffset) +
    `<AletschAnalytics />\n${closingIndent}` +
    layoutContent.slice(insertOffset);

  // Re-parse the spliced text and add the import through the AST.
  try {
    const withChild = project.createSourceFile(`${layoutPath}.staged`, updated, { overwrite: true });
    const statements = withChild.getStatements();
    let index = 0;
    while (index < statements.length) {
      const statement = statements[index];
      const isDirective =
        Node.isExpressionStatement(statement) && Node.isStringLiteral(statement.getExpression());
      if (!isDirective) break;
      index++;
    }
    while (index < statements.length && Node.isImportDeclaration(statements[index])) index++;

    withChild.insertImportDeclaration(index, {
      moduleSpecifier: providerImportSpecifier,
      defaultImport: "AletschAnalytics",
    });

    return { content: withChild.getFullText(), injected: true };
  } catch (error: any) {
    return {
      content: layoutContent,
      injected: false,
      reason: `Could not add the AletschAnalytics import: ${error?.message}`,
    };
  }
}
