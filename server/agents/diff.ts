// Diff extractor for agent jobs. Shells out to `git diff` against the job's
// branch from the parent repository (worktrees share .git so we never need to
// chdir into the worktree itself), then parses the unified output into a
// structured shape the UI can render.

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export type DiffLine = { kind: "ctx" | "add" | "del"; text: string };
export type DiffHunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
};
export type DiffFile = {
  oldPath: string | null;
  newPath: string | null;
  kind: "added" | "modified" | "deleted" | "renamed";
  isBinary: boolean;
  hunks: DiffHunk[];
  stats: { insertions: number; deletions: number };
  truncated?: boolean;
};
export type DiffPayload = {
  jobId: string;
  branch: string;
  base: string;
  files: DiffFile[];
};

const PER_FILE_LINE_CAP = 5000;

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

async function defaultBranchSha(projectRoot: string): Promise<string> {
  // Prefer `main`, then `master`, then HEAD. Returns the sha so the diff
  // doesn't shift if main moves while the user is reviewing.
  for (const candidate of ["main", "master"]) {
    try {
      const { stdout } = await execFile("git", ["rev-parse", candidate], {
        cwd: projectRoot,
      });
      return stdout.trim();
    } catch {
      /* try next */
    }
  }
  const { stdout } = await execFile("git", ["rev-parse", "HEAD"], { cwd: projectRoot });
  return stdout.trim();
}

async function mergeBase(projectRoot: string, branch: string): Promise<string> {
  const base = await defaultBranchSha(projectRoot);
  const { stdout } = await execFile("git", ["merge-base", base, branch], {
    cwd: projectRoot,
  });
  return stdout.trim();
}

/**
 * Extract the structured diff for a job. Returns an empty `files` array when
 * the agent's branch has no commits beyond the merge-base.
 */
export async function extractDiff(
  projectRoot: string,
  jobId: string,
  branch: string,
): Promise<DiffPayload> {
  let base: string;
  try {
    base = await mergeBase(projectRoot, branch);
  } catch {
    return { jobId, branch, base: "", files: [] };
  }

  let raw: string;
  try {
    const { stdout } = await execFile(
      "git",
      ["diff", "--unified=3", "--no-color", "--find-renames", `${base}..${branch}`],
      { cwd: projectRoot, maxBuffer: 64 * 1024 * 1024 },
    );
    raw = stdout;
  } catch {
    return { jobId, branch, base, files: [] };
  }

  return { jobId, branch, base, files: parseUnifiedDiff(raw) };
}

/**
 * Parse `git diff --unified=N` output into structured files. Hand-rolled to
 * avoid pulling in a diff dependency; tested against the cases we actually
 * emit (add / modify / delete / rename / binary).
 */
export function parseUnifiedDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  if (!raw) return files;

  // Split on lines that begin a new file diff.
  const lines = raw.split("\n");
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith("diff --git ")) {
      i++;
      continue;
    }
    const header = lines[i];
    i++;

    const file: DiffFile = {
      oldPath: null,
      newPath: null,
      kind: "modified",
      isBinary: false,
      hunks: [],
      stats: { insertions: 0, deletions: 0 },
    };

    // Header gives us a/<path> and b/<path>; we re-derive from ---/+++ lines.
    const headerMatch = /^diff --git a\/(.+) b\/(.+)$/.exec(header);
    if (headerMatch) {
      file.oldPath = headerMatch[1];
      file.newPath = headerMatch[2];
    }

    // Collect metadata lines until the first hunk, "--- ", or "Binary files".
    while (i < lines.length && !lines[i].startsWith("@@") && !lines[i].startsWith("diff --git ")) {
      const meta = lines[i];

      if (meta.startsWith("new file mode")) file.kind = "added";
      else if (meta.startsWith("deleted file mode")) file.kind = "deleted";
      else if (meta.startsWith("rename from ")) {
        file.kind = "renamed";
        file.oldPath = meta.slice("rename from ".length);
      } else if (meta.startsWith("rename to ")) {
        file.newPath = meta.slice("rename to ".length);
      } else if (meta.startsWith("Binary files ")) {
        file.isBinary = true;
        // No hunks to read; skip ahead.
      } else if (meta.startsWith("--- ")) {
        const p = meta.slice(4);
        if (p === "/dev/null") {
          file.oldPath = null;
          file.kind = "added";
        } else if (p.startsWith("a/")) file.oldPath = p.slice(2);
      } else if (meta.startsWith("+++ ")) {
        const p = meta.slice(4);
        if (p === "/dev/null") {
          file.newPath = null;
          file.kind = "deleted";
        } else if (p.startsWith("b/")) file.newPath = p.slice(2);
      }
      i++;
    }

    if (file.isBinary) {
      files.push(file);
      continue;
    }

    // Now read hunks until next file or end.
    let rendered = 0;
    while (i < lines.length && !lines[i].startsWith("diff --git ")) {
      const hunkLine = lines[i];
      const m = HUNK_RE.exec(hunkLine);
      if (!m) {
        i++;
        continue;
      }
      const hunk: DiffHunk = {
        oldStart: Number(m[1]),
        oldLines: Number(m[2] ?? 1),
        newStart: Number(m[3]),
        newLines: Number(m[4] ?? 1),
        header: m[5].trim(),
        lines: [],
      };
      i++;
      while (i < lines.length && !lines[i].startsWith("@@") && !lines[i].startsWith("diff --git ")) {
        const l = lines[i];
        // Skip the "\ No newline at end of file" annotation lines.
        if (l.startsWith("\\")) {
          i++;
          continue;
        }
        if (rendered >= PER_FILE_LINE_CAP) {
          file.truncated = true;
          i++;
          continue;
        }
        if (l.startsWith("+")) {
          hunk.lines.push({ kind: "add", text: l.slice(1) });
          file.stats.insertions++;
          rendered++;
        } else if (l.startsWith("-")) {
          hunk.lines.push({ kind: "del", text: l.slice(1) });
          file.stats.deletions++;
          rendered++;
        } else if (l.startsWith(" ")) {
          hunk.lines.push({ kind: "ctx", text: l.slice(1) });
          rendered++;
        } else if (l === "") {
          // Empty line inside a hunk (rare; treat as context).
          hunk.lines.push({ kind: "ctx", text: "" });
          rendered++;
        }
        i++;
      }
      file.hunks.push(hunk);
    }

    files.push(file);
  }

  return files;
}
