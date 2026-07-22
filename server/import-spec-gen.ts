// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Import spec-generation endpoint.
 *
 * POST /api/import/spec-generation
 *   Body: { projectRoot: string, force?: boolean, dry?: boolean }
 *   Returns: { jobId, estimatedContextBytes, scanCounts, filesToScan }
 *   - 202: job started (or dry-run preflight only)
 *   - 400: over size cap
 *   - 403: unauthorized path
 *   - 409: openspec/ already exists + no force
 *
 * GET /api/import/spec-generation/:jobId/events
 *   Server-sent events:
 *     event: progress\ndata: <line>\n\n
 *     event: done\ndata: <JSON>\n\n
 *     event: error\ndata: <message>\n\n
 */

import { existsSync } from "node:fs";
import { readdir, lstat } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

// ---- Config -----------------------------------------------------------------
const SIZE_CAP_BYTES = 50 * 1024 * 1024; // 50 MB default

/** Subprocess wall-clock timeout in milliseconds. Configurable via env var. */
const SUBPROCESS_TIMEOUT_MS =
  parseInt(process.env.IMPORT_TIMEOUT_MS ?? "", 10) || 10 * 60 * 1000; // 10 min

/** Grace period after SIGTERM before SIGKILL. */
const KILL_GRACE_MS = 5_000;

/** TTL for completed/errored jobs before eviction from the Map (5 min). */
const JOB_TTL_MS = 5 * 60 * 1000;

/** Maximum number of jobs retained in memory at once. */
const JOBS_MAX = 100;

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

/** Primary source dirs per language (checked in order; first found wins). */
const LANG_SOURCE_DIRS: Record<string, string[]> = {
  flutter: ["lib"],
  node: ["src", "server", "web", "app"],
  rust: ["src"],
  python: ["src", "app"],
  generic: [], // falls back to top-level non-skip dirs
};

// ---- Types ------------------------------------------------------------------
export type PreflightResult = {
  jobId: string;
  estimatedContextBytes: number;
  scanCounts: { code: number; docs: number };
  filesToScan: string[];
};

type JobState = {
  jobId: string;
  projectRoot: string;
  status: "running" | "done" | "error";
  progressLines: string[];
  result?: { capabilities: string[]; durationMs: number };
  errorMessage?: string;
  listeners: Array<(line: string, event?: string) => void>;
};

// ---- In-memory job registry -------------------------------------------------
const jobs = new Map<string, JobState>();

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

/** Detect the project language by looking for manifest files. */
async function detectLanguage(projectRoot: string): Promise<keyof typeof LANG_SOURCE_DIRS> {
  if (existsSync(join(projectRoot, "pubspec.yaml"))) return "flutter";
  if (existsSync(join(projectRoot, "Cargo.toml"))) return "rust";
  if (existsSync(join(projectRoot, "requirements.txt")) ||
      existsSync(join(projectRoot, "pyproject.toml")) ||
      existsSync(join(projectRoot, "setup.py"))) return "python";
  if (existsSync(join(projectRoot, "package.json")) ||
      existsSync(join(projectRoot, "tsconfig.json"))) return "node";
  return "generic";
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

  // Estimate size — use async lstat to avoid blocking the event loop (F9).
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
      estimatedContextBytes: totalBytes,
      scanCounts: { code: codeFiles.length, docs: docFiles.length },
      filesToScan: allFiles.slice(0, 50).map((f) => f.replace(absRoot + "/", "")),
    },
  };
}

// ---- Boot prompt builder ----------------------------------------------------
function buildBootPrompt(projectRoot: string, language: string): string {
  const langDirs = (LANG_SOURCE_DIRS[language] ?? []).join("`, `") || "top-level source dirs";
  return `You are a spec-generation subagent for the ithyno OpenSpec tool.

Your job: read the project at \`${projectRoot}\`, understand its feature areas, then write first-draft OpenSpec capability specs.

**Steps — follow them in order:**

1. Read these files if they exist (skip silently if missing):
   - \`${projectRoot}/README.md\`
   - \`${projectRoot}/CLAUDE.md\`
   - \`${projectRoot}/CONTRIBUTING.md\`
   - All \`*.md\` files under \`${projectRoot}/docs/\`
   - \`${projectRoot}/pubspec.yaml\` or \`${projectRoot}/package.json\` or \`${projectRoot}/Cargo.toml\` (whichever exists)

2. Walk the primary source tree (\`${langDirs}\`) and read a bounded sample:
   - At most 100 source files (largest first)
   - At most 5000 lines total across all files
   - Emit progress: for each file you read, print exactly: \`[import] read: <relative-path>\`

3. Analyze the code + docs. Identify 3–8 distinct capability areas (feature surfaces visible to the user or clearly named in the code). Examples: "sql-editor", "database-connections", "query-results".

4. Run: \`npx openspec init\` in \`${projectRoot}\` to create the openspec/ scaffold.

5. For each capability you identified, create \`${projectRoot}/openspec/specs/<capability>/spec.md\`.
   Use EXACTLY this format (OpenSpec SHALL format):

   \`\`\`markdown
   ## Purpose

   <One sentence describing what this capability does for the user.>

   ## Requirements

   ### Requirement: <Name>

   The system SHALL <verb> <what>.

   #### Scenario: <Name>

   - **GIVEN** <context>
   - **WHEN** <action>
   - **THEN** <outcome>
   \`\`\`

   - Every capability MUST have at least 1 Requirement.
   - Every Requirement MUST have at least 1 Scenario.
   - Emit progress for each: \`[import] drafted: <capability>\`

6. Write \`${projectRoot}/openspec/GENERATED.md\`:
   \`\`\`markdown
   # OpenSpec — LLM-Generated Draft

   > These specs were auto-generated by ithyno on <ISO timestamp>.
   > They are a **starting point only** — review, edit, and archive each
   > capability through the normal OpenSpec workflow before relying on them.

   ## Generated capabilities

   <bullet list of each capability with a relative link to its spec.md>
   \`\`\`

7. DO NOT commit. Do NOT run \`git add\` or \`git commit\`.

8. When finished, print exactly: \`[import] done\`

Start now. Work silently except for the \`[import]\` progress lines.`;
}

// ---- Job runner -------------------------------------------------------------

/** Notify all SSE listeners of a line, then cache it for late-joiners. */
function emit(job: JobState, line: string, event = "progress"): void {
  job.progressLines.push(`event:${event}|${line}`);
  for (const listener of job.listeners) {
    listener(line, event);
  }
}

/** Schedule eviction of a finished job after JOB_TTL_MS (F8). */
function scheduleEviction(jobId: string): void {
  setTimeout(() => {
    jobs.delete(jobId);
  }, JOB_TTL_MS).unref();
}

/**
 * Spawn the generation subagent as a claude subprocess.
 *
 * The boot prompt is written to a temp file (mode 0o600) and passed via
 * `--prompt-file` / `-p` flag so it never appears in `ps` output (F4).
 * Falls back to a stub when CLAUDE_BINARY is set to "stub" (for tests).
 */
export async function startGenerationJob(
  jobId: string,
  projectRoot: string,
  ithynoRoot: string,
): Promise<void> {
  // Evict oldest job if we're at the cap (F8 — LRU cap).
  if (jobs.size >= JOBS_MAX) {
    const firstKey = jobs.keys().next().value;
    if (firstKey !== undefined) jobs.delete(firstKey);
  }

  const absRoot = resolve(projectRoot);
  const language = await detectLanguage(absRoot);
  const bootPrompt = buildBootPrompt(absRoot, language);

  const job: JobState = {
    jobId,
    projectRoot: absRoot,
    status: "running",
    progressLines: [],
    listeners: [],
  };
  jobs.set(jobId, job);

  const startedAt = Date.now();
  const claudeBin = process.env.CLAUDE_BINARY ?? "claude";
  const isStub = claudeBin === "stub";

  // F4: pass the boot prompt via stdin instead of argv so it never appears in
  // `ps aux` / `/proc/<pid>/cmdline`.  `claude -p` reads from stdin when no
  // positional prompt argument is given.
  const child = isStub
    ? spawn("node", ["-e", `
        const lines = ['[import] read: README.md','[import] read: lib/main.dart','[import] drafted: stub-capability','[import] done'];
        let i=0;
        const t=setInterval(()=>{if(i<lines.length){process.stdout.write(lines[i++]+'\\n');}else{clearInterval(t);}},10);
      `], { cwd: absRoot, env: { ...process.env } })
    : spawn(claudeBin, ["-p"], {
        cwd: ithynoRoot,
        env: { ...process.env, ITHYNO_PROJECT_ROOT: absRoot },
        stdio: ["pipe", "pipe", "pipe"],
      });

  // Pipe the boot prompt to stdin and close it so the subprocess can start.
  if (!isStub && child.stdin) {
    child.stdin.write(bootPrompt, "utf8");
    child.stdin.end();
  }

  let buffer = "";
  let timedOut = false;

  // F2: wall-clock timeout — kill the subprocess if it hangs.
  const timeoutHandle = isStub
    ? null
    : setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        // Follow up with SIGKILL if SIGTERM is ignored.
        setTimeout(() => {
          try { child.kill("SIGKILL"); } catch { /* already dead */ }
        }, KILL_GRACE_MS).unref();
      }, SUBPROCESS_TIMEOUT_MS);

  const processLine = (line: string): void => {
    if (line.startsWith("[import] read: ")) {
      emit(job, line);
    } else if (line.startsWith("[import] drafted: ")) {
      emit(job, line);
    } else if (line === "[import] done") {
      // Will be handled in close handler
    }
    // Other output is swallowed (model thinking, etc.)
  };

  const onData = (chunk: Buffer): void => {
    buffer += chunk.toString();
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (line) processLine(line);
    }
  };

  if (child.stdout) child.stdout.on("data", onData);
  if (child.stderr) child.stderr.on("data", onData);

  const cleanup = (): void => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  };

  child.on("close", (code) => {
    cleanup();
    // Flush remaining buffer
    if (buffer.trim()) processLine(buffer.trim());
    buffer = "";

    const durationMs = Date.now() - startedAt;

    if (timedOut) {
      job.status = "error";
      job.errorMessage = `import timed out after ${Math.round(SUBPROCESS_TIMEOUT_MS / 60000)} min`;
      emit(job, job.errorMessage, "error");
      scheduleEviction(jobId);
      return;
    }

    if (code === 0 || isStub) {
      // Extract generated capabilities from progressLines
      const capabilities = job.progressLines
        .map((l) => {
          const m = l.match(/^event:progress\|\[import\] drafted: (.+)$/);
          return m ? m[1] : null;
        })
        .filter((x): x is string => x !== null);

      job.status = "done";
      job.result = { capabilities, durationMs };
      const donePayload = JSON.stringify({ capabilities, durationMs });
      emit(job, donePayload, "done");
    } else {
      job.status = "error";
      job.errorMessage = `subprocess exited with code ${String(code)}`;
      emit(job, job.errorMessage, "error");
    }
    scheduleEviction(jobId);
  });

  child.on("error", (err) => {
    cleanup();
    job.status = "error";
    job.errorMessage = err.message;
    emit(job, err.message, "error");
    scheduleEviction(jobId);
  });
}

// ---- SSE subscriber ---------------------------------------------------------
export function subscribeToJob(
  jobId: string,
  onLine: (line: string, event?: string) => void,
): (() => void) | null {
  const job = jobs.get(jobId);
  if (!job) return null;

  // Replay historical lines first
  for (const stored of job.progressLines) {
    const sep = stored.indexOf("|");
    const ev = stored.slice("event:".length, sep);
    const line = stored.slice(sep + 1);
    onLine(line, ev);
  }

  // If already finished, nothing to subscribe
  if (job.status !== "running") return () => {};

  job.listeners.push(onLine);
  return () => {
    const idx = job.listeners.indexOf(onLine);
    if (idx !== -1) job.listeners.splice(idx, 1);
  };
}

export function getJob(jobId: string): JobState | undefined {
  return jobs.get(jobId);
}
