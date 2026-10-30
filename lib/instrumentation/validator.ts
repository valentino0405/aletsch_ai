// ============================================================
// Aletsch AI — Instrumentation validator
// ------------------------------------------------------------
// Verifies generated code before a developer is ever shown a diff, and
// again before anything is pushed to GitHub.
//
// The rule this enforces: Aletsch may *add* behaviour, never remove or
// alter it. Any check that fails blocks the change from being applied.
// ============================================================

import { Project, SyntaxKind, Node } from "ts-morph";
import { isValidEventName } from "@/lib/ai/intent-classifier";
import type { FileInstrumentationResult } from "./codemod";

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  filePath: string;
  line?: number;
}

export interface FileValidation {
  filePath: string;
  valid: boolean;
  issues: ValidationIssue[];
}

export interface ValidationReport {
  valid: boolean;
  files: FileValidation[];
  errorCount: number;
  warningCount: number;
}

/**
 * Does the generated file parse?
 *
 * Only *syntactic* diagnostics are collected. Semantic ones are
 * worthless here: each file is parsed in isolation, with no
 * node_modules, no lib files and no tsconfig `paths`, so TypeScript
 * would report "Cannot find module 'react'" for perfectly valid code.
 * A syntax error, by contrast, always means we generated broken code.
 */
function syntaxErrors(filePath: string, content: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  try {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { jsx: 4, allowJs: true, target: 99 },
    });
    const sourceFile = project.createSourceFile(filePath, content, { overwrite: true });

    for (const diagnostic of project.getProgram().getSyntacticDiagnostics(sourceFile)) {
      const messageText = diagnostic.getMessageText();
      issues.push({
        severity: "error",
        code: `ts${diagnostic.getCode()}`,
        message: typeof messageText === "string" ? messageText : messageText.getMessageText(),
        filePath,
        line: diagnostic.getLineNumber(),
      });
    }
  } catch (error: any) {
    issues.push({
      severity: "error",
      code: "parse_failed",
      message: `Generated file does not parse: ${error?.message ?? "unknown error"}`,
      filePath,
    });
  }
  return issues;
}

/** Handler identifiers referenced by JSX event props, per line. */
function collectHandlerReferences(filePath: string, content: string): Set<string> {
  const references = new Set<string>();
  try {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { jsx: 4, allowJs: true, target: 99 },
    });
    const sourceFile = project.createSourceFile(filePath, content, { overwrite: true });

    sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute).forEach((attribute) => {
      const name = attribute.getNameNode().getText();
      if (!/^on[A-Z]/.test(name)) return;
      const initializer = attribute.getInitializer();
      if (!initializer || !Node.isJsxExpression(initializer)) return;
      const expression = initializer.getExpression();
      if (!expression) return;

      expression.getDescendantsOfKind(SyntaxKind.Identifier).forEach((identifier) => {
        references.add(identifier.getText());
      });
      if (Node.isIdentifier(expression)) references.add(expression.getText());
    });
  } catch {
    /* the syntax check reports parse failures; nothing to add here */
  }
  return references;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count++;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function directiveIsFirst(content: string): boolean {
  const project = new Project({useInMemoryFileSystem: true, skipLoadingLibFiles: true, compilerOptions: {jsx: 4}});
  const file = project.createSourceFile("directive.tsx", content);
  let prologue = true;
  for (const statement of file.getStatements()) {
    const expression = Node.isExpressionStatement(statement) ? statement.getExpression() : undefined;
    if (expression && Node.isStringLiteral(expression)) {
      if (/^use (client|server)$/.test(expression.getLiteralValue()) && !prologue) return false;
    } else prologue = false;
  }
  return true;
}

/** Validates one instrumented file against its original. */
export function validateInstrumentedFile(result: FileInstrumentationResult): FileValidation {
  const issues: ValidationIssue[] = [];
  const { filePath, originalContent, instrumentedContent } = result;

  if (result.error) {
    issues.push({ severity: "error", code: "codemod_failed", message: result.error, filePath });
    return { filePath, valid: false, issues };
  }

  if (result.unchanged) {
    return { filePath, valid: true, issues };
  }

  // 1. It has to parse.
  issues.push(...syntaxErrors(filePath, instrumentedContent));

  // 2. Every applied event must actually appear in the output.
  for (const edit of result.applied) {
    if (!isValidEventName(edit.eventName)) {
      issues.push({
        severity: "error",
        code: "invalid_event_name",
        message: `"${edit.eventName}" is not a valid snake_case event name.`,
        filePath,
        line: edit.lineNumber,
      });
      continue;
    }
    if (!instrumentedContent.includes(JSON.stringify(edit.eventName))) {
      issues.push({
        severity: "error",
        code: "event_missing",
        message: `${edit.eventName} was reported as applied but is not present in the generated file.`,
        filePath,
        line: edit.lineNumber,
      });
    }
  }

  // 3. Exactly one tracker import.
  const importCount = countOccurrences(instrumentedContent, "trackEvent");
  const importDeclarations = (instrumentedContent.match(/import\s*\{[^}]*\btrackEvent\b[^}]*\}\s*from/g) || []).length;
  if (result.applied.length > 0 && importDeclarations === 0) {
    issues.push({
      severity: "error",
      code: "import_missing",
      message: "Instrumentation was applied but the trackEvent import is missing.",
      filePath,
    });
  }
  if (importDeclarations > 1) {
    issues.push({
      severity: "error",
      code: "duplicate_import",
      message: `trackEvent is imported ${importDeclarations} times.`,
      filePath,
    });
  }
  if (result.applied.length > 0 && importCount < result.applied.length + 1) {
    issues.push({
      severity: "warning",
      code: "call_count_mismatch",
      message: `Expected at least ${result.applied.length} trackEvent calls plus the import, found ${importCount} references.`,
      filePath,
    });
  }

  // 4. No original handler may disappear. This is the check that
  //    guarantees we wrapped rather than replaced.
  const before = collectHandlerReferences(filePath, originalContent);
  const after = collectHandlerReferences(filePath, instrumentedContent);
  for (const handler of before) {
    if (handler === "trackEvent") continue;
    if (!after.has(handler)) {
      issues.push({
        severity: "error",
        code: "handler_lost",
        message: `The handler reference "${handler}" was present before instrumentation and is missing afterwards.`,
        filePath,
      });
    }
  }

  // 5. Directive prologue must remain first, or Next silently treats
  //    the module as a server component.
  if (!directiveIsFirst(instrumentedContent)) {
    issues.push({
      severity: "error",
      code: "directive_displaced",
      message: 'The "use client" directive is no longer the first statement in the file.',
      filePath,
    });
  }

  // 6. The same event should not be emitted twice from one element.
  const duplicates = new Map<string, number>();
  for (const edit of result.applied) {
    const key = `${edit.lineNumber}:${edit.sourceColumn ?? ""}:${edit.attribute}:${edit.eventName}`;
    duplicates.set(key, (duplicates.get(key) ?? 0) + 1);
  }
  for (const [key, count] of duplicates) {
    if (count > 1) {
      issues.push({
        severity: "error",
        code: "duplicate_event",
        message: `${key.split(":").at(-1)} is emitted ${count} times from the same element.`,
        filePath,
        line: Number(key.split(":")[0]),
      });
    }
  }

  // 7. Sanity: instrumentation only adds lines.
  const originalLines = originalContent.split("\n").length;
  const newLines = instrumentedContent.split("\n").length;
  if (newLines < originalLines) {
    issues.push({
      severity: "error",
      code: "content_shrank",
      message: `The file lost ${originalLines - newLines} lines. Instrumentation must only add code.`,
      filePath,
    });
  }

  return {
    filePath,
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}

/** Validates an entire change set. */
export function validateChangeSet(results: FileInstrumentationResult[]): ValidationReport {
  const files = results.map(validateInstrumentedFile);
  const errorCount = files.reduce(
    (total, file) => total + file.issues.filter((issue) => issue.severity === "error").length,
    0
  );
  const warningCount = files.reduce(
    (total, file) => total + file.issues.filter((issue) => issue.severity === "warning").length,
    0
  );

  return { valid: errorCount === 0, files, errorCount, warningCount };
}

/** Validates a generated-from-scratch file (tracker, provider, events). */
export function validateGeneratedFile(filePath: string, content: string): FileValidation {
  const issues = syntaxErrors(filePath, content);
  if (!directiveIsFirst(content)) {
    issues.push({
      severity: "error",
      code: "directive_displaced",
      message: 'The "use client" directive must be the first statement.',
      filePath,
    });
  }
  return { filePath, valid: !issues.some((issue) => issue.severity === "error"), issues };
}
