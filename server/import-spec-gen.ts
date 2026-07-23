// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Import spec-generation endpoint.
 *
 * POST /api/import/spec-generation
 *   Body: { projectRoot: string, force?: boolean, dry?: boolean }
 *   Returns: { jobId, targetPath, estimatedContextBytes, scanCounts, filesToScan }
 *   - 202: dispatched to Manager PTY (or dry-run preflight only)
 *   - 400: over size cap
 *   - 403: unauthorized path
 *   - 409: openspec/ already exists + no force
 *   - 503: Manager PTY not running
 *
 * The SSE endpoint (GET /api/import/spec-generation/:jobId/events) has been
 * REMOVED. Progress is now observed via the workspace file-watch WS broadcast:
 * the dashboard reacts to `state-replaced` events and checks for
 * `openspec/GENERATED.md` via the `generatedMarkerPresent` field on
 * WorkspaceState. See refactor-import-to-task-tool-subagent.
 */

import { existsSync } from "node:fs";
import { readdir, lstat } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { randomUUID } from "node:crypto";

// ---- Config -----------------------------------------------------------------
const SIZE_CAP_BYTES = 50 * 1024 * 1024; // 50 MB default

/** File extensions considered "code" for size/sampling purposes. */
const CODE_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rs", ".go", ".java", ".kt", ".swift",
  ".dart", ".c", ".cpp", ".h", ".hpp",
  ".rb", ".php", ".cs", ".scala", ".clj", ".ex", ".exs",
  ".lua", ".r", ".jl", ".zig", ".v",
]);

/** File extensions considered "docs". */
const DOC_EXTS = new Set([".md", ".mdx", ".rst", ".txt"]);

/** Directory names to skip when walking. */
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".svn", "vendor", "__pycache__",
  ".dart_tool", "build", "dist", "out", ".venv", "venv",
  ".cache", "coverage", ".next", ".nuxt", "target", "Pods",
  ".worktrees", "openspec",
]);

// ---- Types ------------------------------------------------------------------
export type PreflightResult = {
  jobId: string;
  targetPath: string;
  estimatedContextBytes: number;
  scanCounts: { code: number; docs: number };
  filesToScan: string[];
};

// ---- File walker ------------------------------------------------------------
async function walkDir(
  dir: string,
  collect: (filePath: string, isDoc: boolean) => void,
  depth = 0,
): Promise<void> {
  if (depth > 6) return;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  await Promise.all(
    entries.map(async (name) => {
      if (name.startsWith(".") && name !== ".dart_tool") return;
      if (SKIP_DIRS.has(name)) return;
      const full = join(dir, name);
      let st: Awaited<ReturnType<typeof lstat>>;
      try {
        st = await lstat(full);
      } catch {
        return;
      }
      // Skip symlinks entirely — following them could escape the project root.
      if (st.isSymbolicLink()) return;
      if (st.isDirectory()) {
        await walkDir(full, collect, depth + 1);
      } else if (st.isFile()) {
        const ext = extname(name).toLowerCase();
        if (CODE_EXTS.has(ext)) collect(full, false);
        else if (DOC_EXTS.has(ext)) collect(full, true);
      }
    }),
  );
}

// ---- Preflight scan ---------------------------------------------------------
export async function preflight(
  projectRoot: string,
  force: boolean,
  authorized: (path: string) => boolean,
): Promise<
  | { ok: true; result: PreflightResult }
  | { ok: false; status: 400 | 403 | 409; reason: string }
> {
  const absRoot = resolve(projectRoot);

  // 403: path authorization
  if (!authorized(absRoot)) {
    return { ok: false, status: 403, reason: "projectRoot is not under an authorized directory" };
  }

  // 409: openspec/ already exists + no force
  if (!force && existsSync(join(absRoot, "openspec"))) {
    return {
      ok: false,
      status: 409,
      reason: `openspec/ already exists at ${join(absRoot, "openspec")}; pass force: true to overwrite`,
    };
  }

  // Walk files — use Sets for O(1) dedup, single pass covers docs/ automatically.
  const codeSet = new Set<string>();
  const docSet = new Set<string>();

  await walkDir(absRoot, (filePath, isDoc) => {
    if (isDoc) docSet.add(filePath);
    else codeSet.add(filePath);
  });

  const codeFiles = [...codeSet];
  const docFiles = [...docSet];

  // Estimate size — use async lstat to avoid blocking the event loop.
  let totalBytes = 0;
  const allFiles = [...codeFiles, ...docFiles];
  await Promise.all(
    allFiles.map(async (f) => {
      try {
        const s = (await lstat(f)).size;
        totalBytes += s;
      } catch {
        /* ignore */
      }
    }),
  );

  // 400: size cap
  if (totalBytes > SIZE_CAP_BYTES) {
    return {
      ok: false,
      status: 400,
      reason: `project code+docs size ${(totalBytes / 1024 / 1024).toFixed(1)} MB exceeds ${SIZE_CAP_BYTES / 1024 / 1024} MB cap`,
    };
  }

  const jobId = randomUUID();
  return {
    ok: true,
    result: {
      jobId,
      targetPath: absRoot,
      estimatedContextBytes: totalBytes,
      scanCounts: { code: codeFiles.length, docs: docFiles.length },
      filesToScan: allFiles.slice(0, 50).map((f) => f.replace(absRoot + "/", "")),
    },
  };
}

/**
 * Inject `/ithy-opsx:import <targetPath>` into the Manager PTY.
 *
 * Returns ok: true on success, ok: false with a reason when the PTY is not
 * running, the inject fails, or targetPath contains characters that would
 * break or hijack the PTY command line (CR, LF, NUL, or other C0 controls).
 *
 * The caller (server/index.ts) maps ok: false → 503 (PTY not running) or
 * 400 (bad targetPath).
 */
export function injectImportCommand(
  targetPath: string,
  inject: (data: string, terminate: boolean) => { ok: true } | { ok: false; reason: string },
): { ok: true } | { ok: false; reason: string; status?: 400 } {
  // Guard against shell / PTY injection via embedded control characters.
  // A path containing \n or \r would cause two separate lines to be written
  // to the PTY — the second line would be an arbitrary command injection.
  // NUL (\0) is also invalid in POSIX path names and must be rejected.
  // We also exclude the DEL character (0x7f) and all other C0/C1 controls.
  if (/[\x00-\x1f\x7f-\x9f]/.test(targetPath)) {
    return {
      ok: false,
      reason: "targetPath contains control characters that are not allowed in a PTY command",
      status: 400,
    };
  }
  const cmd = `/ithy-opsx:import ${targetPath}`;
  return inject(cmd, true);
}
