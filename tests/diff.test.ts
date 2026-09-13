import { test } from "node:test";
import assert from "node:assert/strict";
import { createFileDiff, diffLines, summarizeDiffs } from "@/lib/instrumentation/diff";

test("identical content produces no diff", () => {
  const diff = createFileDiff("a\nb\nc", "a\nb\nc", { filePath: "x.ts" });
  assert.equal(diff.unchanged, true);
  assert.equal(diff.unified, "");
  assert.equal(diff.stats.additions, 0);
  assert.equal(diff.stats.deletions, 0);
});

test("a single inserted line is reported as one addition", () => {
  const diff = createFileDiff("a\nb\nc", "a\nNEW\nb\nc", { filePath: "x.ts" });
  assert.equal(diff.stats.additions, 1);
  assert.equal(diff.stats.deletions, 0);
  assert.ok(diff.unified.includes("+NEW"));
});

test("a single deleted line is reported as one deletion", () => {
  const diff = createFileDiff("a\nb\nc", "a\nc", { filePath: "x.ts" });
  assert.equal(diff.stats.deletions, 1);
  assert.equal(diff.stats.additions, 0);
  assert.ok(diff.unified.includes("-b"));
});

test("a replaced line is one deletion plus one addition", () => {
  const diff = createFileDiff("a\nb\nc", "a\nB\nc", { filePath: "x.ts" });
  assert.equal(diff.stats.additions, 1);
  assert.equal(diff.stats.deletions, 1);
});

test("hunk headers count the lines they actually contain", () => {
  const before = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
  const after = before.replace("line 10", "line 10 CHANGED");
  const diff = createFileDiff(before, after, { filePath: "x.ts", context: 3 });

  assert.equal(diff.hunks.length, 1);
  const hunk = diff.hunks[0];
  assert.equal(hunk.lines.filter((l) => l.kind !== "insert").length, hunk.oldLines);
  assert.equal(hunk.lines.filter((l) => l.kind !== "delete").length, hunk.newLines);
  // 3 context + 1 change + 3 context on each side
  assert.equal(hunk.oldLines, 7);
  assert.equal(hunk.newLines, 7);
});

test("distant changes become separate hunks", () => {
  const before = Array.from({ length: 60 }, (_, i) => `line ${i}`).join("\n");
  const after = before.replace("line 5", "FIVE").replace("line 50", "FIFTY");
  const diff = createFileDiff(before, after, { filePath: "x.ts", context: 3 });
  assert.equal(diff.hunks.length, 2);
});

test("nearby changes are merged into one hunk", () => {
  const before = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
  const after = before.replace("line 10", "TEN").replace("line 12", "TWELVE");
  const diff = createFileDiff(before, after, { filePath: "x.ts", context: 3 });
  assert.equal(diff.hunks.length, 1);
});

test("a new file diffs against /dev/null", () => {
  const diff = createFileDiff("", "hello\nworld", { filePath: "new.ts" });
  assert.equal(diff.isNewFile, true);
  assert.ok(diff.unified.startsWith("--- /dev/null"));
  assert.equal(diff.stats.additions, 2);
});

test("the edit script reconstructs the new content exactly", () => {
  const before = "import a from 'a';\n\nfunction go() {\n  return 1;\n}\n";
  const after = "import a from 'a';\nimport { track } from './t';\n\nfunction go() {\n  track('x');\n  return 1;\n}\n";

  const changes = diffLines(before.split("\n"), after.split("\n"));
  const rebuilt = changes
    .filter((c) => c.kind !== "delete")
    .map((c) => c.line)
    .join("\n");
  assert.equal(rebuilt, after);

  const original = changes
    .filter((c) => c.kind !== "insert")
    .map((c) => c.line)
    .join("\n");
  assert.equal(original, before);
});

test("CRLF input is normalised rather than reported as a whole-file rewrite", () => {
  const diff = createFileDiff("a\r\nb\r\nc", "a\nb\nc", { filePath: "x.ts" });
  assert.equal(diff.unchanged, false, "content differs byte-wise so a diff object is produced");
  assert.equal(diff.stats.additions, 0);
  assert.equal(diff.stats.deletions, 0);
});

test("summarizeDiffs totals a change set", () => {
  const diffs = [
    createFileDiff("a", "a\nb", { filePath: "one.ts" }),
    createFileDiff("", "x", { filePath: "two.ts" }),
    createFileDiff("same", "same", { filePath: "three.ts" }),
  ];
  const summary = summarizeDiffs(diffs);
  assert.equal(summary.filesChanged, 2);
  assert.equal(summary.filesCreated, 1);
  assert.equal(summary.additions, 2);
});
