// ============================================================
// Aletsch AI — Unified diff generator
// ------------------------------------------------------------
// A dependency-free line diff used to show developers exactly what
// Aletsch will change before anything is written or pushed.
//
// Uses Myers' O(ND) algorithm, which is what git itself uses. Falls
// back to a whole-file replacement hunk for pathological inputs so a
// diff is *always* produced rather than the UI silently showing
// nothing.
// ============================================================

export type ChangeKind = "equal" | "insert" | "delete";

export interface LineChange {
  kind: ChangeKind;
  line: string;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  /** Lines that appear unchanged in both versions. */
  unchanged: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: { kind: ChangeKind; text: string }[];
}

export interface FileDiff {
  filePath: string;
  /** Standard `--- / +++ / @@` text, ready to display or apply. */
  unified: string;
  hunks: DiffHunk[];
  stats: DiffStats;
  isNewFile: boolean;
  /** True when old and new content are byte-identical. */
  unchanged: boolean;
}

/** Beyond this the O(ND) search is abandoned for a coarse diff. */
const MAX_DIFF_LINES = 12_000;

function splitLines(text: string): string[] {
  if (text === "") return [];
  return text.replace(/\r\n/g, "\n").split("\n");
}

/**
 * Myers diff. Returns the edit script as a flat list of line changes.
 *
 * The classic formulation stores a copy of the `v` frontier per edit
 * distance so the path can be walked backwards; for the file sizes we
 * handle (a few thousand lines) that is comfortably cheap.
 */
export function diffLines(oldLines: string[], newLines: string[]): LineChange[] {
  const n = oldLines.length;
  const m = newLines.length;

  if (n === 0 && m === 0) return [];
  if (n === 0) return newLines.map((line) => ({ kind: "insert" as const, line }));
  if (m === 0) return oldLines.map((line) => ({ kind: "delete" as const, line }));

  if (n + m > MAX_DIFF_LINES) {
    return [
      ...oldLines.map((line) => ({ kind: "delete" as const, line })),
      ...newLines.map((line) => ({ kind: "insert" as const, line })),
    ];
  }

  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 1);
  const trace: Int32Array[] = [];

  let found = -1;
  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      const idx = k + offset;
      let x: number;
      if (k === -d || (k !== d && v[idx - 1] < v[idx + 1])) {
        x = v[idx + 1]; // move down (insertion)
      } else {
        x = v[idx - 1] + 1; // move right (deletion)
      }
      let y = x - k;
      while (x < n && y < m && oldLines[x] === newLines[y]) {
        x++;
        y++;
      }
      v[idx] = x;
      if (x >= n && y >= m) {
        found = d;
        break outer;
      }
    }
  }

  if (found < 0) {
    return [
      ...oldLines.map((line) => ({ kind: "delete" as const, line })),
      ...newLines.map((line) => ({ kind: "insert" as const, line })),
    ];
  }

  // Walk the trace backwards to recover the path.
  const changes: LineChange[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const previous = trace[d];
    const k = x - y;
    const idx = k + offset;
    const down = k === -d || (k !== d && previous[idx - 1] < previous[idx + 1]);
    const prevK = down ? k + 1 : k - 1;
    const prevX = previous[prevK + offset];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      changes.push({ kind: "equal", line: oldLines[x - 1] });
      x--;
      y--;
    }
    if (down) {
      changes.push({ kind: "insert", line: newLines[y - 1] });
      y--;
    } else {
      changes.push({ kind: "delete", line: oldLines[x - 1] });
      x--;
    }
  }
  while (x > 0 && y > 0) {
    changes.push({ kind: "equal", line: oldLines[x - 1] });
    x--;
    y--;
  }

  changes.reverse();
  return changes;
}

const SIGIL: Record<ChangeKind, string> = { equal: " ", insert: "+", delete: "-" };

/**
 * Groups the edit script into hunks with `context` unchanged lines
 * around each run of changes.
 */
function buildHunks(changes: LineChange[], context: number): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let oldLine = 1;
  let newLine = 1;

  // Index every change with its 1-based line numbers first, so hunk
  // headers stay correct no matter how the runs are grouped.
  const numbered = changes.map((change) => {
    const entry = { ...change, oldLine, newLine };
    if (change.kind !== "insert") oldLine++;
    if (change.kind !== "delete") newLine++;
    return entry;
  });

  let index = 0;
  while (index < numbered.length) {
    if (numbered[index].kind === "equal") {
      index++;
      continue;
    }

    // Extend backwards for leading context.
    let start = Math.max(0, index - context);

    // Extend forwards, absorbing changes separated by <= 2*context
    // equal lines into the same hunk (git's behaviour).
    let end = index;
    let run = 0;
    for (let scan = index; scan < numbered.length; scan++) {
      if (numbered[scan].kind === "equal") {
        run++;
        if (run > context * 2) break;
      } else {
        run = 0;
        end = scan;
      }
    }
    end = Math.min(numbered.length - 1, end + context);

    const slice = numbered.slice(start, end + 1);
    const first = slice[0];
    const oldCount = slice.filter((l) => l.kind !== "insert").length;
    const newCount = slice.filter((l) => l.kind !== "delete").length;

    hunks.push({
      oldStart: oldCount === 0 ? Math.max(0, first.oldLine - 1) : first.oldLine,
      oldLines: oldCount,
      newStart: newCount === 0 ? Math.max(0, first.newLine - 1) : first.newLine,
      newLines: newCount,
      lines: slice.map((l) => ({ kind: l.kind, text: l.line })),
    });

    index = end + 1;
  }

  return hunks;
}

export interface DiffOptions {
  /** Unchanged lines shown around each change. Default 3, like git. */
  context?: number;
  /** Path shown in the `---`/`+++` header. */
  filePath: string;
  /** Renders the header as a new-file diff (`--- /dev/null`). */
  isNewFile?: boolean;
}

/** Produces a git-compatible unified diff for one file. */
export function createFileDiff(oldContent: string, newContent: string, options: DiffOptions): FileDiff {
  const context = options.context ?? 3;
  const filePath = options.filePath;
  const isNewFile = options.isNewFile ?? oldContent === "";

  if (oldContent === newContent) {
    return {
      filePath,
      unified: "",
      hunks: [],
      stats: { additions: 0, deletions: 0, unchanged: splitLines(newContent).length },
      isNewFile,
      unchanged: true,
    };
  }

  const changes = diffLines(splitLines(oldContent), splitLines(newContent));
  const hunks = buildHunks(changes, context);

  const stats: DiffStats = {
    additions: changes.filter((c) => c.kind === "insert").length,
    deletions: changes.filter((c) => c.kind === "delete").length,
    unchanged: changes.filter((c) => c.kind === "equal").length,
  };

  const header = [
    `--- ${isNewFile ? "/dev/null" : `a/${filePath}`}`,
    `+++ b/${filePath}`,
  ];
  const body = hunks.flatMap((hunk) => [
    `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    ...hunk.lines.map((line) => `${SIGIL[line.kind]}${line.text}`),
  ]);

  return {
    filePath,
    unified: [...header, ...body].join("\n"),
    hunks,
    stats,
    isNewFile,
    unchanged: false,
  };
}

/** Aggregates stats across a change set, for the review header. */
export function summarizeDiffs(diffs: FileDiff[]): DiffStats & { filesChanged: number; filesCreated: number } {
  return diffs.reduce(
    (accumulator, diff) => ({
      additions: accumulator.additions + diff.stats.additions,
      deletions: accumulator.deletions + diff.stats.deletions,
      unchanged: accumulator.unchanged + diff.stats.unchanged,
      filesChanged: accumulator.filesChanged + (diff.unchanged ? 0 : 1),
      filesCreated: accumulator.filesCreated + (diff.isNewFile && !diff.unchanged ? 1 : 0),
    }),
    { additions: 0, deletions: 0, unchanged: 0, filesChanged: 0, filesCreated: 0 }
  );
}
