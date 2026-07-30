// SPDX-License-Identifier: GPL-3.0-or-later
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { WebSocketServer, WebSocket } from "ws";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, realpathSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, resolve, sep } from "node:path";
import { resolveOpenspecDir, scanWorkspace, parseChange, changeIdForPath } from "./parser/workspace.js";
import { parseSpec } from "./parser/spec.js";
import { scanDocs, readDocsFile, docsRelPath } from "./parser/docs.js";
import { collectTags, getTagDetail } from "./parser/tags.js";
import { applyToggle } from "./sync/surgicalEdit.js";
import { Watcher, ProjectRootWatcher } from "./sync/watcher.js";
import { loadPty, attachPtyToSocket, injectIntoActive, injectIntoManager, activeTerminalCount, ptyStartup, commandExistsOnPath, terminateAllLivePtys } from "./sync/pty.js";
import { resolveGitBash } from "./util/resolve-git-bash.js";
import { AgentRegistry, type AgentDef } from "./agents/registry.js";
import { AgentRunner, type JobSummary, type JobStatus } from "./agents/runner.js";
import { applyAgentConfigPayload, coercePayload, writeAgmsg, writeParallelExecution } from "./agents/config-writer.js";
import { syncSpawnOptions } from "./agents/spawn-options-writer.js";
import { extractDiff, type DiffPayload } from "./agents/diff.js";
import { setExecutionInFrontmatter, type ExecutionMode } from "./parser/proposal-edit.js";
import { sha1 } from "./util/hash.js";
import {
  SESSION_TOKEN,
  buildOriginAllowList,
  checkAuthHttp,
  checkAuthWs,
  extractToken,
  verifyToken,
} from "./util/auth.js";
import type { Change, DocsFile, DocsTree, SpecDomain, GitStatus } from "./model.js";
import { getGitStatus } from "./git/status.js";
import { readGitConfig, writeLocalConfig } from "./git/config.js";
import { gitInit } from "./git/init.js";
import { getChangeGitState, commitChangeProposal } from "./git/change-state.js";
import { PHASES, isPhase, isReservedPhase, NEEDS_HUMAN, type Phase } from "./phases.js";
import { readSidecar, writeSidecar, extractSidecarFields } from "./sidecar.js";
import { writeNeedsHuman, appendAnswer, parseNeedsHuman } from "./needs-human.js";
import { getAboutInfo } from "./about.js";
import { runDoctor } from "./doctor.js";
import type { DoctorReport } from "./doctor.js";
import {
  getAllManagerActivities,
  parseManagerActivityBody,
  setManagerActivity,
  type ManagerActivity,
} from "./manager-activity.js";

// Same shape as the change-id validation done implicitly by other endpoints
// (`openspec/changes/<id>/` in file paths). Kept strict because both handlers
// below shell out to `git` with `<id>` embedded in the path.
const SAFE_CHANGE_ID = /^[A-Za-z0-9._-]+$/;
function isSafeChangeId(id: string): boolean {
  if (!id) return false;
  if (id === "." || id === "..") return false;
  return SAFE_CHANGE_ID.test(id);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");

const PORT = Number(process.env.PORT ?? 4321);
// Normalize via realpath so a symlinked launch path still matches equally-
// resolved targetPaths in Pattern classification (A/B). Fall back to the
// non-real path if realpath fails (e.g., the dir was just created and the
// filesystem hasn't finalized).
// Mutable — updated at runtime by `setProjectRoot()` when
// `POST /api/project/switch` is called (respawn-manager-pty-on-project-switch).
// All handlers that read the current project root MUST go through
// `getProjectRoot()` rather than capturing this identifier by closure.
let currentProjectRoot = (() => {
  const resolved = resolve(process.env.ITHYNO_PROJECT_ROOT ?? process.cwd());
  try { return realpathSync(resolved, { encoding: "utf8" }); } catch { return resolved; }
})();
export function getProjectRoot(): string { return currentProjectRoot; }
function setProjectRoot(next: string): void {
  currentProjectRoot = next;
  openspecDir = resolveOpenspecDir(currentProjectRoot);
}
const DEV = process.env.ITHYNO_DEV === "1";
const SHOULD_OPEN = process.env.ITHYNO_OPEN === "1";

// Mutable — updated at runtime when the ProjectRootWatcher detects that
// openspec/ has been created by an import sub-agent or `openspec init`,
// AND by setProjectRoot() on runtime project switch.
// All handlers that read this variable call resolveOpenspecDir(getProjectRoot())
// live (see /api/state) or read this variable after it has been updated.
// Never cache this in a local const inside a long-lived closure.
let openspecDir = resolveOpenspecDir(currentProjectRoot);

// Concurrency guard for POST /api/project/switch — a second concurrent
// call receives 409. Cleared in `finally` so error paths don't leave
// the flag stuck.
let projectSwitchInProgress = false;

const fastify = Fastify({ logger: false });

// ---- CSRF protection -------------------------------------------------------
// Built once we know the listening port (see fastify.listen below). Used by
// the onRequest hook and the WS upgrade handler.
//
// In DEV mode the UI is served by Vite on port 5173 with a proxy to the API,
// so the browser's Origin is `http://localhost:5173`, not the Fastify port.
// We include the Vite origin in the allow-list so mutating requests and
// WebSocket upgrades work in dev.
const VITE_DEV_PORT = 5173;
const DEV_EXTRA_ORIGINS = DEV
  ? [
      `http://localhost:${VITE_DEV_PORT}`,
      `http://127.0.0.1:${VITE_DEV_PORT}`,
      `http://[::1]:${VITE_DEV_PORT}`,
    ]
  : [];
let ORIGIN_ALLOW = buildOriginAllowList(PORT, DEV_EXTRA_ORIGINS);

fastify.addHook("onRequest", async (req, reply) => {
  const res = checkAuthHttp(
    {
      method: req.method,
      url: req.url,
      headers: req.headers as Record<string, string | string[] | undefined>,
    },
    ORIGIN_ALLOW,
  );
  if (res.ok) return;
  reply.code(res.status).send({ error: res.error });
});

// ---- WebSocket broadcast ---------------------------------------------------
const wss = new WebSocketServer({ noServer: true });
// Dedicated WS for the embedded terminal. Separate from /ws so terminal bytes
// never mix with structured dashboard events.
const ptyWss = new WebSocketServer({ noServer: true });

type ServerEvent =
  | { type: "state-replaced" }
  | { type: "change-updated"; changeId: string; change: Change }
  | { type: "worktree-change-updated"; changeId: string; change: Change }
  | { type: "spec-updated"; domain: string; spec: SpecDomain }
  | { type: "doc-updated"; path: string; file: DocsFile | null; tree: DocsTree }
  | { type: "tags-updated" }
  | { type: "agent-job-started"; job: JobSummary }
  | { type: "agent-job-output"; jobId: string; chunk: string; stream: "stdout" | "stderr" | "stdin" }
  | { type: "agent-job-finished"; jobId: string; status: JobStatus; exitCode: number | null }
  | { type: "agent-job-removed"; jobId: string; changeId: string }
  | { type: "worktree-progress-updated"; jobId: string; changeId: string; progress: { done: number; total: number } }
  | { type: "git-status-updated"; gitStatus: GitStatus }
  | { type: "import-completed"; jobId: string; targetPath: string; pattern: "A" | "B" }
  | {
      type: "agents-updated";
      ok: boolean;
      error?: string;
      agents: Array<Omit<AgentDef, "env"> & { hasEnv: boolean }>;
      parallelExecution: boolean;
      agmsg: import("./agents/registry.js").AgmsgConfig | null;
      warnings: string[];
    }
  | { type: "doctor-updated"; report: DoctorReport }
  // expose-manager-activity-per-change: `activity: null` means the entry was
  // cleared (the Manager posted `idle` for that change).
  | { type: "manager-activity-updated"; changeId: string; activity: ManagerActivity | null };

function broadcast(event: ServerEvent): void {
  const payload = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

// ---- Echo-suppressing file watcher ----------------------------------------
let watcher: Watcher | null = null;

/**
 * Start the openspec/ Watcher for the resolved openspecDir. Extracted as a
 * function so it can be called both at boot (when openspec/ already exists) and
 * from the ProjectRootWatcher callback (when openspec/ is created at runtime
 * by an import or `openspec init`).
 *
 * The `resolvedDir` argument must be the absolute path of the openspec/
 * directory that was just detected. In the boot case this equals the module-
 * level `openspecDir`; in the runtime case we re-resolve it here so the
 * closure captures the right value.
 */
function startOpenspecWatcher(resolvedDir: string): void {
  watcher = new Watcher(resolvedDir, async (filePath, event) => {
    try {
      // Any markdown change under openspec/ may have updated frontmatter tags.
      if (filePath.endsWith(".md")) broadcast({ type: "tags-updated" });
      const changeId = changeIdForPath(resolvedDir, filePath);
      if (changeId) {
        // add-needs-human-phase editor fallback: if the changed file is
        // `needs-human.md`, guard on the current phase BEFORE parsing so a
        // duplicate chokidar fire (or a manual re-save after resolution) is
        // a no-op — we've already restored on the first event. When the
        // guard passes and the footer reads `answered: true`, run the same
        // restore path the /answer API uses.
        //
        // Match on basename (cross-platform: chokidar uses `\` on Windows)
        // AND require the file lives directly at
        // `openspec/changes/<changeId>/needs-human.md` (not a subdir with
        // a coincidentally-named template file).
        const isDirectNeedsHuman =
          basename(filePath) === "needs-human.md" &&
          dirname(filePath) === join(resolvedDir, "changes", changeId);
        if (event !== "unlink" && isDirectNeedsHuman) {
          const raw = await readSidecar(getProjectRoot(), changeId);
          const cur = extractSidecarFields(raw, changeId);
          if (cur.phase === NEEDS_HUMAN) {
            const doc = await parseNeedsHuman(getProjectRoot(), changeId);
            if (doc?.answered) {
              const restored = cur.priorPhase ?? "proposed";
              await writeSidecar(getProjectRoot(), changeId, {
                phase: restored,
                priorPhase: undefined,
                escalatedAt: undefined,
              }, watcher ?? undefined);
            }
          }
        }
        const change = await parseChange(resolvedDir, changeId);
        broadcast({ type: "change-updated", changeId, change });
        return;
      }
      // specs/<domain>/spec.md or anything else: re-broadcast a top-level spec.
      const specsPrefix = join(resolvedDir, "specs") + sep;
      if (filePath.startsWith(specsPrefix) && filePath.endsWith("spec.md") && event !== "unlink") {
        const domain = filePath.slice(specsPrefix.length).split(sep)[0];
        const content = await readFile(filePath, "utf8");
        broadcast({ type: "spec-updated", domain, spec: parseSpec(domain, filePath, content) });
        return;
      }
      broadcast({ type: "state-replaced" });
    } catch {
      broadcast({ type: "state-replaced" });
    }
  });
  watcher.start();
}

if (openspecDir) {
  startOpenspecWatcher(openspecDir);
} else {
  // Fallback: watch the project root for the creation of an `openspec/`
  // directory. This is the import scenario — ithyno started before
  // `openspec/` existed. Without this watcher, no `state-replaced` WS
  // broadcast would ever fire after the import sub-agent writes
  // `openspec/GENERATED.md`, leaving the ImportProgress dashboard stuck.
  // Also handles `openspec init` from a shell while ithyno is running.
  // Idempotency guard: prevents double-start if the callback somehow fires
  // more than once (e.g. a future refactor adds a second call path). The
  // ProjectRootWatcher's own `stopped` flag makes this practically impossible
  // today, but a module-level boolean is cheap insurance. (NF1)
  let openspecWatcherStarted = false;
  const projectRootWatcher = new ProjectRootWatcher(getProjectRoot(), () => {
    if (openspecWatcherStarted) {
      console.log(`[watcher] openspec/ detected again — idempotency guard: ignoring duplicate call`);
      return;
    }
    openspecWatcherStarted = true;

    const newOpenspecDir = resolveOpenspecDir(getProjectRoot());
    console.log(`[watcher] openspec/ detected at ${getProjectRoot()} — starting Watcher`);
    if (newOpenspecDir) {
      // Update the module-level variable so all subsequent requests
      // (withinOpenspec, change endpoints, /api/state) see the real path.
      openspecDir = newOpenspecDir;
      startOpenspecWatcher(newOpenspecDir);
    }
    // Broadcast state-replaced regardless — the dashboard needs to re-fetch
    // even if resolveOpenspecDir somehow returns null in an edge case.
    broadcast({ type: "state-replaced" });
  });
  projectRootWatcher.start();
}

// Second watcher for the design-docs space (`docs/`). Reuses the same Watcher
// class with echo suppression; it just points at a different root.
const DOCS_DIR = join(getProjectRoot(), "docs");
let docsWatcher: Watcher | null = null;
if (existsSync(DOCS_DIR)) {
  docsWatcher = new Watcher(DOCS_DIR, async (filePath) => {
    try {
      const relPath = docsRelPath(getProjectRoot(), filePath);
      const tree = await scanDocs(getProjectRoot());
      let file: DocsFile | null = null;
      if (relPath) file = await readDocsFile(getProjectRoot(), relPath);
      broadcast({ type: "doc-updated", path: relPath ?? "", file, tree });
      broadcast({ type: "tags-updated" });
    } catch {
      /* swallow */
    }
  });
  docsWatcher.start();
}

// ---- Agent runner ----------------------------------------------------------
const agentRegistry = new AgentRegistry(getProjectRoot());
await agentRegistry.load();
// auto-sync-agmsg-spawn-options: on boot, ensure ~/.agmsg/config/spawn_options.yaml
// mirrors non-`--model` args of live-shell workers in agents.yaml. Silent on failure —
// this is a defensive sync that also runs on POST /api/agents/config.
try {
  await syncSpawnOptions(agentRegistry.publicConfig() as unknown as import("./agents/registry.js").AgentConfig);
} catch (err) {
  console.warn(
    `[boot] spawn_options.yaml sync failed: ${err instanceof Error ? err.message : String(err)}`,
  );
}
const agentRunner = new AgentRunner(getProjectRoot(), agentRegistry, (ev) => broadcast(ev));
// Adopt any `.worktrees/<change-id>/` sitting on disk into the runner's
// job map so the Kanban card can offer Merge/Discard without the user
// having to shell out. Awaited so that the very first `/api/agents/jobs`
// response and the initial `/api/state` a reconnecting client sees
// already include the adopted orphans — otherwise the client races with
// this init and misses the one-shot `agent-job-started` events.
// See add-orphan-worktree-adoption.
await agentRunner.adoptOrphanWorktrees();
// Debounced broadcast of the fresh registry state on `agents.yaml`
// file-system changes. Debouncing collapses atomic-write patterns
// (`.tmp → rename` fires multiple fs.watch events on macOS) into a
// single event. See add-agents-broadcast-on-file-event.
let agentsBroadcastTimer: NodeJS.Timeout | null = null;
void agentRegistry.startWatching(() => {
  if (agentsBroadcastTimer) clearTimeout(agentsBroadcastTimer);
  agentsBroadcastTimer = setTimeout(() => {
    agentsBroadcastTimer = null;
    const cfg = agentRegistry.publicConfig();
    console.log(
      `[registry] broadcasting agents-updated (${cfg.agents.length} agents, ${cfg.warnings.length} warnings)`,
    );
    broadcast({
      type: "agents-updated",
      ok: cfg.ok,
      error: cfg.error,
      agents: cfg.agents,
      parallelExecution: cfg.parallelExecution,
      agmsg: cfg.agmsg,
      warnings: cfg.warnings,
    });
  }, 100);
});

process.on("SIGINT", () => {
  agentRunner.shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  agentRunner.shutdown();
  process.exit(0);
});

// ---- Helpers ---------------------------------------------------------------
const SAFE_ID_RE = /^[A-Za-z0-9._-]+$/;

function withinOpenspec(filePath: string): boolean {
  const abs = resolve(filePath);
  if (openspecDir && (abs === openspecDir || abs.startsWith(openspecDir + sep))) return true;
  // Also accept `<projectRoot>/.worktrees/<safe-id>/openspec/…` so verify
  // ticks on the worktree view can write back. Enforce a safe id charset and
  // require the `openspec` segment to prevent writes into worktree code.
  const worktreesRoot = resolve(getProjectRoot(), ".worktrees");
  if (!(abs === worktreesRoot || abs.startsWith(worktreesRoot + sep))) return false;
  const rel = abs.slice(worktreesRoot.length + 1);
  const [id, second] = rel.split(sep);
  if (!id || !SAFE_ID_RE.test(id)) return false;
  if (second !== "openspec") return false;
  return true;
}

function isLocal(addr: string | undefined): boolean {
  if (!addr) return false;
  return (
    addr === "127.0.0.1" ||
    addr === "::1" ||
    addr === "::ffff:127.0.0.1" ||
    addr.startsWith("127.")
  );
}

// ---- REST API --------------------------------------------------------------
fastify.get("/api/health", async () => {
  const pty = await loadPty();
  return {
    ok: true,
    openspecDir,
    projectRoot: getProjectRoot(),
    terminal: pty.available
      ? { available: true as const }
      : { available: false as const, reason: pty.reason },
  };
});

fastify.get("/api/about", async () => getAboutInfo());

// ---- Doctor endpoints (add-doctor-and-installer) ---------------------------
// GET /api/doctor — returns DoctorReport. Session-token authed via the global
// onRequest hook (mutating methods) but also gated on explicit token check
// here since GET reads are not caught by the CSRF hook.
fastify.get("/api/doctor", async (req, reply) => {
  const token = extractToken({
    headers: req.headers as Record<string, string | string[] | undefined>,
    url: req.url,
  });
  if (!token || !verifyToken(token)) {
    return reply.code(401).send({ error: "auth required" });
  }
  const report = await runDoctor();
  return report;
});

// POST /api/doctor/install — streams installer progress via SSE.
// Accepts { tool: "tmux" | "agmsg" }. Rejects anything else with 400.
// tmux: detects brew / apt-get / dnf / pacman.
// agmsg: copies the vendored tree from electron/vendor or guide the user.
fastify.post<{ Body: { tool?: unknown } }>("/api/doctor/install", async (req, reply) => {
  const tool = req.body?.tool;
  if (tool !== "tmux" && tool !== "agmsg") {
    return reply
      .code(400)
      .send({ error: `only "tmux" and "agmsg" are installable via this endpoint` });
  }

  // Set up SSE stream. hijack() first — see the identical comment on
  // /api/init/stream — otherwise Fastify's own reply-completion logic
  // fires after this handler resolves and crashes the process with
  // ERR_HTTP_HEADERS_SENT if the client disconnected mid-install.
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  let clientAlive = true;
  reply.raw.on("close", () => {
    clientAlive = false;
  });

  const sendSse = (event: string, data: unknown) => {
    if (!clientAlive) return;
    try {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      clientAlive = false;
    }
  };

  const INSTALL_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  if (tool === "agmsg") {
    // agmsg install: copy the vendored tree from electron/vendor/agmsg
    const { homedir: homedirFn } = await import("node:os");
    const { join: joinPath } = await import("node:path");
    const { existsSync: existsSyncFn, mkdirSync, cpSync, chmodSync, readdirSync, statSync } = await import("node:fs");

    const TARGET_ROOT = joinPath(homedirFn(), ".agents", "skills", "agmsg");
    const TARGET_MARKER = joinPath(TARGET_ROOT, "scripts", "send.sh");

    if (existsSyncFn(TARGET_MARKER)) {
      sendSse("progress", { line: "agmsg is already installed." });
      sendSse("done", { ok: true, exitCode: 0 });
      if (clientAlive) reply.raw.end();
      // Broadcast doctor-updated
      void runDoctor().then((report) => broadcast({ type: "doctor-updated", report }));
      return;
    }

    // Windows: agmsg also needs a real Git Bash and sqlite3 on PATH to
    // actually run (see add-windows-agmsg-support) — check BEFORE
    // copying the tree. Copying files that can't run is worse than not
    // copying: the doctor report would then show a false-positive
    // "installed" for the marker file alone.
    if (process.platform === "win32") {
      const missing: string[] = [];
      if (!resolveGitBash()) missing.push("Git Bash (install Git for Windows)");
      if (!commandExistsOnPath("sqlite3")) missing.push("sqlite3");
      if (missing.length > 0) {
        sendSse("progress", { line: `Cannot install agmsg — missing: ${missing.join(", ")}` });
        sendSse("done", { ok: false, exitCode: 1 });
        if (clientAlive) reply.raw.end();
        return;
      }
    }

    // Try to find the vendored tree
    const vendorCandidates = [
      joinPath(PKG_ROOT, "vendor", "agmsg"),
      joinPath(PKG_ROOT, "electron", "vendor", "agmsg"),
    ];
    const vendorRoot = vendorCandidates.find((p) => existsSyncFn(joinPath(p, "scripts", "send.sh")));

    if (!vendorRoot) {
      sendSse("progress", { line: "Vendored agmsg not found. Install via: /plugin marketplace add fujibee/agmsg" });
      sendSse("done", { ok: false, exitCode: 1 });
      if (clientAlive) reply.raw.end();
      return;
    }

    try {
      sendSse("progress", { line: `Installing agmsg from ${vendorRoot} …` });
      mkdirSync(joinPath(homedirFn(), ".agents", "skills"), { recursive: true });
      // force: true — always overwrite existing files so a partial/interrupted
      // install does not silently leave the tree incomplete (F2 fix).
      cpSync(vendorRoot, TARGET_ROOT, { recursive: true, force: true });
      // chmod .sh files
      function chmodShells(dir: string): void {
        if (!existsSyncFn(dir)) return;
        for (const entry of readdirSync(dir)) {
          const full = joinPath(dir, entry);
          const st = statSync(full);
          if (st.isDirectory()) chmodShells(full);
          else if (entry.endsWith(".sh")) {
            try { chmodSync(full, 0o755); } catch { /* ignore */ }
          }
        }
      }
      chmodShells(joinPath(TARGET_ROOT, "scripts"));
      sendSse("progress", { line: `agmsg installed to ${TARGET_ROOT}` });
      sendSse("done", { ok: true, exitCode: 0 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendSse("progress", { line: `Install failed: ${msg}` });
      sendSse("done", { ok: false, exitCode: 1 });
    }
    if (clientAlive) reply.raw.end();
    void runDoctor().then((report) => broadcast({ type: "doctor-updated", report }));
    return;
  }

  // tool === "tmux"
  // Detect package manager
  const { platform } = await import("node:os");
  const os = platform();

  let installCmd: string[];

  if (os === "darwin") {
    installCmd = ["brew", "install", "tmux"];
  } else if (os === "linux") {
    // Try to detect apt-get, dnf, pacman in order
    const { execFileSync } = await import("node:child_process");
    function hasCmd(c: string): boolean {
      try { execFileSync("which", [c], { stdio: "ignore", timeout: 1000 }); return true; } catch { return false; }
    }
    if (hasCmd("apt-get")) {
      installCmd = ["apt-get", "install", "-y", "tmux"];
    } else if (hasCmd("dnf")) {
      installCmd = ["dnf", "install", "-y", "tmux"];
    } else if (hasCmd("pacman")) {
      installCmd = ["pacman", "-S", "--noconfirm", "tmux"];
    } else {
      sendSse("progress", { line: "No known package manager found (tried apt-get, dnf, pacman). See https://github.com/tmux/tmux/wiki/Installing" });
      sendSse("done", { ok: false, exitCode: 1 });
      if (clientAlive) reply.raw.end();
      return;
    }
  } else if (os === "win32") {
    // No package manager reliably installs a working tmux fork on
    // Windows (confirmed during add-windows-agmsg-support dogfooding —
    // psmux is the fork that was verified working, via Git Bash).
    // There is no automated install path; stream guidance instead of
    // a dead-end rejection. This is NOT a failure of the request
    // itself, so respond via the normal stream-completion path
    // (ok: false meaning "nothing was installed"), not a 400.
    sendSse("progress", { line: "No automated tmux install exists for Windows." });
    sendSse("progress", { line: "Download a Windows tmux fork (psmux): https://github.com/psmux/psmux/releases" });
    sendSse("progress", { line: "Extract it and add the folder containing tmux.exe to your PATH, then re-run Doctor." });
    sendSse("done", { ok: false, exitCode: 1 });
    if (clientAlive) reply.raw.end();
    return;
  } else {
    sendSse("progress", { line: `Unsupported platform "${os}". See https://github.com/tmux/tmux/wiki/Installing` });
    sendSse("done", { ok: false, exitCode: 1 });
    if (clientAlive) reply.raw.end();
    return;
  }

  // Spawn the install command and stream output
  const { spawn: spawnChild } = await import("node:child_process");
  sendSse("progress", { line: `Running: ${installCmd.join(" ")}` });

  await new Promise<void>((resolveProm) => {
    const child = spawnChild(installCmd[0], installCmd.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
    }, INSTALL_TIMEOUT);

    child.stdout?.on("data", (d: Buffer) => {
      sendSse("progress", { line: d.toString().replace(/\n$/, "") });
    });
    child.stderr?.on("data", (d: Buffer) => {
      sendSse("progress", { line: d.toString().replace(/\n$/, "") });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      sendSse("progress", { line: `Error: ${err.message}` });
      sendSse("done", { ok: false, exitCode: null });
      if (clientAlive) reply.raw.end();
      void runDoctor().then((report) => broadcast({ type: "doctor-updated", report }));
      resolveProm();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const ok = !timedOut && code === 0;
      if (timedOut) {
        sendSse("progress", { line: "Install timed out (5 min limit)." });
      }
      sendSse("done", { ok, exitCode: code });
      if (clientAlive) reply.raw.end();
      if (ok) {
        void runDoctor().then((report) => broadcast({ type: "doctor-updated", report }));
      }
      resolveProm();
    });
  });
});

// Dedicated lightweight token-validity check so the UI can detect a stale
// token at first load (typically after a server restart) without waiting for
// the user to perform a mutating action.
fastify.get("/api/auth/check", async (req, reply) => {
  const token = extractToken({
    headers: req.headers as Record<string, string | string[] | undefined>,
    url: req.url,
  });
  if (!token || !verifyToken(token)) {
    return reply.code(401).send({ error: "auth required" });
  }
  return { ok: true };
});

// ---- Manager activity (expose-manager-activity-per-change) -----------------
// In-memory, per-change record of what the Manager (the /ithy-opsx:dispatch
// orchestrator) is currently doing. Written ONLY by the dispatch skill from
// the Manager PTY, which is why both endpoints are session-token gated rather
// than open like /api/state. Nothing here is persisted: a server restart
// legitimately returns {} and the skill re-posts as it re-enters its loop.

// POST /api/manager/activity — set (or clear, when `activity: "idle"`) the
// activity for one change, then broadcast the new value to every dashboard.
fastify.post("/api/manager/activity", async (req, reply) => {
  const token = extractToken({
    headers: req.headers as Record<string, string | string[] | undefined>,
    url: req.url,
  });
  if (!token || !verifyToken(token)) {
    return reply.code(401).send({ error: "auth required" });
  }
  const parsed = parseManagerActivityBody(req.body);
  if (!parsed.ok) {
    return reply.code(400).send({ error: parsed.error });
  }
  if (parsed.deprecatedStage) {
    // reshape-phase-view-to-active-agent-state: `stage` renamed to `role`.
    // Accepted as a deprecated alias for one release cycle so in-flight
    // Manager sessions from an older skill version don't 400.
    req.log.warn(
      `POST /api/manager/activity used deprecated 'stage' field; rename to 'role' (change: ${parsed.value.changeId})`,
    );
  }
  // setManagerActivity returns the stored record, or null when the write was
  // an idle-clear — that return value IS the broadcast payload.
  const activity = setManagerActivity(parsed.value);
  broadcast({ type: "manager-activity-updated", changeId: parsed.value.changeId, activity });
  return { ok: true, activity };
});

// GET /api/manager/activity — bulk snapshot for client bootstrap / reconnect.
fastify.get("/api/manager/activity", async (req, reply) => {
  const token = extractToken({
    headers: req.headers as Record<string, string | string[] | undefined>,
    url: req.url,
  });
  if (!token || !verifyToken(token)) {
    return reply.code(401).send({ error: "auth required" });
  }
  return getAllManagerActivities();
});

fastify.get("/api/state", async () => {
  // Re-resolve every call so that a runtime openspec/ creation (import
  // sub-agent, `openspec init`) is reflected immediately without a server
  // restart. The module-level `openspecDir` is updated by the ProjectRootWatcher
  // callback, but calling resolveOpenspecDir here as well ensures correctness
  // even if there is a narrow race between the watcher fire and this handler.
  const liveOpenspecDir = resolveOpenspecDir(getProjectRoot());
  if (liveOpenspecDir && !openspecDir) {
    // Watcher callback hasn't fired yet — update the module-level var so
    // other handlers (withinOpenspec, change endpoints) also see it.
    openspecDir = liveOpenspecDir;
  }
  return scanWorkspace(liveOpenspecDir, getProjectRoot());
});

// ---- Browse endpoints (unify-open-project-3-branch) -----------------------
// Both endpoints are read-only and require the session token (via the
// existing onRequest auth hook). They work regardless of whether openspec/
// exists — that is precisely what enables the Browse read-only mode.

fastify.get("/api/browse/markdown-tree", async () => {
  const { buildMarkdownTree } = await import("./browse.js");
  return buildMarkdownTree(getProjectRoot());
});

fastify.get<{ Querystring: { path?: string } }>(
  "/api/browse/markdown",
  async (req, reply) => {
    const relPath = req.query.path ?? "";
    const { resolveSafePath } = await import("./browse.js");
    const resolved = await resolveSafePath(getProjectRoot(), relPath);
    if (!resolved.ok) {
      return reply.code(400).send({ error: resolved.reason });
    }
    if (!resolved.abs.endsWith(".md") && !resolved.abs.endsWith(".markdown")) {
      return reply.code(400).send({ error: "only markdown files may be read" });
    }
    let content: string;
    try {
      const { readFile: rf } = await import("node:fs/promises");
      const { stat: st } = await import("node:fs/promises");
      const stats = await st(resolved.abs);
      if (stats.size > 5 * 1024 * 1024) {
        return reply.code(413).send({ error: "file exceeds 5 MB limit" });
      }
      content = await rf(resolved.abs, "utf8");
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        return reply.code(404).send({ error: "file not found" });
      }
      throw err;
    }
    return { path: relPath, content };
  },
);

// ---- git identity ----------------------------------------------------------
fastify.get("/api/git/status", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) return reply.code(403).send({ error: "local only" });
  return getGitStatus(getProjectRoot());
});

fastify.get("/api/git/config", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) return reply.code(403).send({ error: "local only" });
  const status = await getGitStatus(getProjectRoot());
  if (!status.isRepo) return reply.code(409).send({ error: "not a git repository" });
  return readGitConfig(getProjectRoot());
});

type GitConfigBody = { userName?: string; userEmail?: string };
fastify.post<{ Body: GitConfigBody }>("/api/git/config", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) return reply.code(403).send({ error: "local only" });
  const body = req.body ?? {};
  if (body.userName === undefined && body.userEmail === undefined) {
    return reply.code(400).send({ error: "at least one of userName / userEmail required" });
  }
  const status = await getGitStatus(getProjectRoot());
  if (!status.isRepo) return reply.code(409).send({ error: "not a git repository — run /api/git/init first" });
  try {
    await writeLocalConfig(getProjectRoot(), body);
    console.log(`[git] wrote local config: ${JSON.stringify(body)}`);
  } catch (err) {
    console.error(`[git] writeLocalConfig failed:`, err);
    return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
  }
  broadcast({ type: "git-status-updated", gitStatus: status });
  return { ok: true, gitStatus: status };
});

fastify.post("/api/git/init", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) return reply.code(403).send({ error: "local only" });
  try {
    const gitStatus = await gitInit(getProjectRoot());
    if (!gitStatus.isRepo) {
      const reason = gitStatus.reason === "git-missing" ? "git binary not found in PATH" : "init failed";
      console.warn(`[git] init did not result in a repo: ${reason}`);
      return reply.code(500).send({ error: reason });
    }
    console.log(`[git] initialized repo at ${gitStatus.root}`);
    broadcast({ type: "git-status-updated", gitStatus });
    return { ok: true, gitStatus };
  } catch (err) {
    console.error(`[git] init failed:`, err);
    return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/init — scaffold a new project via runInit (add-init-http-endpoint).
// Backbone for UI-driven "New Project" flows. Electron / VS Code may import
// runInit directly instead (see main.ts's onNewProject); this endpoint
// remains for browser mode and as a fallback.
//
// Extended by expand-init-to-scaffold-agents:
//   - Calls runDoctor() before scaffolding; 409 if readyForManager is false.
//   - Accepts optional manager.command (Cli); validates against installed list.
//   - After openspec init, writes agents.yaml from templates/agents.yaml.tmpl.
//   - Rolls back openspec/ on agents.yaml write failure; returns 500.
//   - Response includes managerCommand.
type InitBody = {
  dir?: unknown;
  force?: unknown;
  skipGitignore?: unknown;
  autoCreateDir?: unknown;
  autoGitInit?: unknown;
  manager?: unknown;
  defaultManager?: unknown;
  /**
   * When true, skip runInit entirely and only run the doctor gate +
   * writeAgentsYaml. Consumed by OnboardingProject's follow-up POST
   * after the SSE chain has already written openspec/ — avoids
   * re-running openspec init --force and overwriting the scaffold.
   * (expand-init-to-scaffold-agents rework r2, F2 fix)
   */
  agentsYamlOnly?: unknown;
};
// Shared body validator for both /api/init and /api/init/stream so
// behavior stays identical (add-new-project-onboarding-window).
async function validateInitBody(body: InitBody): Promise<
  | { ok: true; dir: string }
  | { ok: false; status: 400; reason: string }
> {
  if (typeof body.dir !== "string" || body.dir.length === 0) {
    return { ok: false, status: 400, reason: "`dir` is required and must be a string" };
  }
  const { isAbsolute } = await import("node:path");
  if (!isAbsolute(body.dir)) {
    return { ok: false, status: 400, reason: "`dir` must be an absolute path" };
  }
  return { ok: true, dir: body.dir };
}

fastify.post<{ Body: InitBody }>("/api/init", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) {
    return reply.code(403).send({ error: "local only" });
  }
  const body = req.body ?? {};
  const v = await validateInitBody(body);
  if (!v.ok) return reply.code(v.status).send({ ok: false, reason: v.reason });

  // ---- Doctor gate + Manager resolution (expand-init-to-scaffold-agents) --
  const { runDoctor } = await import("./doctor.js");
  const { resolveManagerFromDoctor, writeAgentsYaml } = await import("./init-handler.js");
  const report = await runDoctor();

  const requestedCommand =
    body.manager !== undefined &&
    body.manager !== null &&
    typeof body.manager === "object" &&
    "command" in (body.manager as object) &&
    typeof (body.manager as { command: unknown }).command === "string"
      ? (body.manager as { command: string }).command
      : undefined;

  const gateResult = resolveManagerFromDoctor(report, {
    managerCommand: requestedCommand,
    defaultManager: typeof body.defaultManager === "string" ? body.defaultManager : undefined,
  });

  if (!gateResult.ok) {
    return reply.code(gateResult.status).send(
      gateResult.status === 409
        ? { error: gateResult.error, hint: gateResult.hint }
        : { error: gateResult.error, installed: gateResult.installed },
    );
  }

  const { chosenCli } = gateResult;

  // ---- Run scaffold + openspec init (skipped when agentsYamlOnly is true) --
  // agentsYamlOnly: true — caller (OnboardingProject follow-up POST) has
  // already scaffolded openspec/ via the SSE chain; only write agents.yaml.
  // Running runInit again with force:true would overwrite the scaffold.
  // (expand-init-to-scaffold-agents rework r2, F2 fix)
  //
  // Use runNewProjectChain (not raw runInit): it runs the ithyno template
  // copy AND `npx openspec init` so `openspec/config.yaml` actually gets
  // created. runInit alone only prints a "next steps" hint and returns —
  // that leaves state.exists === false and the NoProjectDecisionPanel
  // never transitions to Kanban (bug fix, 2026-07-24).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let initResult: Record<string, unknown> = { ok: true };
  if (body.agentsYamlOnly !== true) {
    const { runNewProjectChain } = await import("../bin/new-project-chain.js");
    const events: Array<{ step: string; line?: string; message?: string; type: string }> = [];
    const chainResult = await runNewProjectChain(v.dir, (ev) => {
      // Non-streaming caller — capture events for the JSON response instead
      // of an SSE stream. Errors are surfaced via chainResult.ok = false.
      events.push(ev as { step: string; line?: string; message?: string; type: string });
    });
    if (!chainResult.ok) {
      const errorEvent = events.find((e) => e.type === "error");
      return reply.code(500).send({
        ok: false,
        reason: errorEvent?.message ?? "runNewProjectChain failed",
        events,
      });
    }
    initResult = { ok: true, target: chainResult.target, events } as unknown as Record<string, unknown>;
  }

  // ---- Write agents.yaml from template (with rollback on failure) ----------
  try {
    await writeAgentsYaml(v.dir, chosenCli, PKG_ROOT);
  } catch (err) {
    return reply.code(500).send({
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { ...initResult, managerCommand: chosenCli };
});

// POST /api/init/stream — SSE sibling that runs runNewProjectChain
// (runInit + `npx openspec init`) and streams ChainEvents. Consumed
// by the shared /onboarding React page (add-new-project-onboarding-
// window).
fastify.post<{ Body: InitBody }>("/api/init/stream", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) {
    return reply.code(403).send({ error: "local only" });
  }
  const body = req.body ?? {};
  const v = await validateInitBody(body);
  if (!v.ok) return reply.code(v.status).send({ ok: false, reason: v.reason });

  // hijack() tells Fastify to stop managing this reply once we start
  // writing to reply.raw ourselves — without it, Fastify's own
  // reply-completion logic still runs after this async handler
  // resolves and calls reply.send() on a socket we've already ended
  // (or that the client aborted mid-stream), throwing
  // ERR_HTTP_HEADERS_SENT uncaught and crashing the whole process.
  // Confirmed live: a client disconnecting mid-`openspec init` (e.g.
  // a curl --max-time cutoff, or closing the onboarding window) took
  // the entire server down.
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const { runNewProjectChain } = await import("../bin/new-project-chain.js");
  let clientAlive = true;
  reply.raw.on("close", () => {
    clientAlive = false;
  });

  const write = (event: unknown): void => {
    if (!clientAlive) return;
    try {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      clientAlive = false;
    }
  };

  await runNewProjectChain(v.dir, write);

  if (clientAlive) {
    try {
      reply.raw.end();
    } catch {
      /* client already closed */
    }
  }
});

fastify.get<{ Params: { id: string }; Querystring: { tree?: string } }>(
  "/api/changes/:id",
  async (req, reply) => {
    if (!openspecDir) return reply.code(404).send({ error: "no openspec directory" });
    if (req.query?.tree === "worktree") {
      // add-worktree-change-view: serve from `.worktrees/<id>/openspec/` so
      // the dashboard can render the running agent's live tasks.md, proposal
      // edits, delta specs — anything the agent has touched on its branch.
      const worktreeOpenspec = join(getProjectRoot(), ".worktrees", req.params.id, "openspec");
      if (!existsSync(worktreeOpenspec)) {
        return reply.code(404).send({
          error: `no worktree at .worktrees/${req.params.id}. The plain URL /change/${req.params.id} shows the main-tree view.`,
        });
      }
      return parseChange(worktreeOpenspec, req.params.id);
    }
    return parseChange(openspecDir, req.params.id);
  },
);

type ProposalExecutionBody = { mode: ExecutionMode };
fastify.post<{ Params: { id: string }; Body: ProposalExecutionBody }>(
  "/api/changes/:id/proposal/execution",
  async (req, reply) => {
    if (!openspecDir) return reply.code(404).send({ error: "no openspec directory" });
    const mode = req.body?.mode;
    if (mode !== "worktree" && mode !== "terminal") {
      return reply.code(400).send({ error: "mode must be 'worktree' or 'terminal'" });
    }
    const path = join(openspecDir, "changes", req.params.id, "proposal.md");
    let content: string;
    try {
      content = await readFile(path, "utf8");
    } catch {
      return reply.code(404).send({ error: "proposal.md not found for this change" });
    }
    const next = setExecutionInFrontmatter(content, mode);
    if (next !== content) {
      await writeFile(path, next, "utf8");
      watcher?.recordWrite(path, sha1(next));
    }
    const change = await parseChange(openspecDir, req.params.id);
    broadcast({ type: "change-updated", changeId: req.params.id, change });
    return { status: "ok", change };
  },
);

// ---- start (worktree) uncommitted-proposal guard --------------------------
// GET /api/changes/:id/git-state returns files under openspec/changes/<id>/
// that would NOT be carried into a fresh `git worktree add HEAD`. The Kanban
// Start flow queries this before dispatching the runner and pops
// UncommittedProposalModal if anything shows up. Localhost-only + auth-gated
// like the other GETs.
fastify.get<{ Params: { id: string } }>(
  "/api/changes/:id/git-state",
  async (req, reply) => {
    if (!isLocal(req.socket.remoteAddress ?? undefined)) return reply.code(403).send({ error: "local only" });
    if (!isSafeChangeId(req.params.id)) return reply.code(400).send({ error: "invalid change id" });
    return getChangeGitState(getProjectRoot(), req.params.id);
  },
);

// POST /api/changes/:id/commit-proposal runs `git add openspec/changes/<id>/`
// + `git commit -m "propose: <id>"` in the main tree. Used by
// UncommittedProposalModal's Commit & Start action so the follow-up
// `git worktree add HEAD` carries the proposal into the agent's tree.
fastify.post<{ Params: { id: string } }>(
  "/api/changes/:id/commit-proposal",
  async (req, reply) => {
    if (!isLocal(req.socket.remoteAddress ?? undefined)) return reply.code(403).send({ error: "local only" });
    if (!isSafeChangeId(req.params.id)) return reply.code(400).send({ error: "invalid change id" });
    try {
      const { commitHash } = await commitChangeProposal(getProjectRoot(), req.params.id);
      return { ok: true, commitHash };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "NOTHING_TO_COMMIT") {
        return reply.code(409).send({ ok: false, reason: "nothing to commit" });
      }
      req.log.error({ err, changeId: req.params.id }, "commit-proposal failed");
      return reply.code(500).send({ ok: false, reason: msg });
    }
  },
);

// ---- phase state machine (add-phase-state-machine) ------------------------
// GET returns the persisted phase for a change (null when unphased).
// POST validates against the active enum, rejects reserved values with a
// pointer to the phase-gates idea note, writes the sidecar, and rebroadcasts
// the change via the existing `change-updated` WS event (state-updated
// equivalent — no new event variant added).
fastify.get<{ Params: { id: string } }>(
  "/api/changes/:id/phase",
  async (req, reply) => {
    if (!isSafeChangeId(req.params.id)) return reply.code(400).send({ error: "invalid change id" });
    if (!openspecDir) return reply.code(404).send({ error: "no openspec directory" });
    const changeDir = join(openspecDir, "changes", req.params.id);
    if (!existsSync(changeDir)) return reply.code(404).send({ error: "change not found" });
    const raw = await readSidecar(getProjectRoot(), req.params.id);
    const { phase } = extractSidecarFields(raw, req.params.id);
    return { phase: phase ?? null };
  },
);

type PhasePostBody = { phase?: unknown };
fastify.post<{ Params: { id: string }; Body: PhasePostBody }>(
  "/api/changes/:id/phase",
  async (req, reply) => {
    if (!isSafeChangeId(req.params.id)) return reply.code(400).send({ error: "invalid change id" });
    if (!openspecDir) return reply.code(404).send({ error: "no openspec directory" });
    const changeDir = join(openspecDir, "changes", req.params.id);
    if (!existsSync(changeDir)) return reply.code(404).send({ error: "change not found" });

    const requested = req.body?.phase;
    if (isReservedPhase(requested)) {
      return reply.code(400).send({
        error: `phase '${requested}' is reserved for Phase 4 (see docs/ideas/2026-07-04-phase-gates-and-putback.md); not yet supported`,
      });
    }
    if (!isPhase(requested)) {
      return reply.code(400).send({
        error: `unknown phase '${String(requested)}'; expected one of ${PHASES.join(", ")}`,
      });
    }

    await writeSidecar(
      getProjectRoot(),
      req.params.id,
      { phase: requested },
      watcher ?? undefined,
    );

    const change = await parseChange(openspecDir, req.params.id);
    broadcast({ type: "change-updated", changeId: req.params.id, change });
    return { ok: true, phase: requested satisfies Phase };
  },
);

// ---- needs-human escalation (add-needs-human-phase) -----------------------
// Phase-agnostic escalation state that lives on top of the phase machine.
// A change escalates *from* any phase (defaulting to `proposed` when
// unphased) and *returns* to that phase when the escalation is answered.
// Both routes inherit CSRF protection from the global onRequest hook.

type EscalatePostBody = { question?: unknown; context?: unknown };
fastify.post<{ Params: { id: string }; Body: EscalatePostBody }>(
  "/api/changes/:id/needs-human",
  async (req, reply) => {
    if (!isSafeChangeId(req.params.id)) return reply.code(400).send({ error: "invalid change id" });
    if (!openspecDir) return reply.code(404).send({ error: "no openspec directory" });
    const changeDir = join(openspecDir, "changes", req.params.id);
    if (!existsSync(changeDir)) return reply.code(404).send({ error: "change not found" });

    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    if (!question) return reply.code(400).send({ error: "question required" });
    const context = typeof req.body?.context === "string" ? req.body.context : undefined;

    // 409 when already escalated — one open escalation per change.
    const currentRaw = await readSidecar(getProjectRoot(), req.params.id);
    const current = extractSidecarFields(currentRaw, req.params.id);
    if (current.phase === NEEDS_HUMAN) {
      return reply.code(409).send({ error: "change already escalated" });
    }

    const priorPhase = current.phase ?? "proposed";
    const escalatedAt = new Date().toISOString();
    await writeNeedsHuman(getProjectRoot(), req.params.id, question, context);
    await writeSidecar(
      getProjectRoot(),
      req.params.id,
      { phase: NEEDS_HUMAN, priorPhase, escalatedAt },
      watcher ?? undefined,
    );

    const change = await parseChange(openspecDir, req.params.id);
    broadcast({ type: "change-updated", changeId: req.params.id, change });
    return { ok: true, phase: NEEDS_HUMAN, priorPhase, escalatedAt };
  },
);

type AnswerPostBody = { answer?: unknown };
fastify.post<{ Params: { id: string }; Body: AnswerPostBody }>(
  "/api/changes/:id/needs-human/answer",
  async (req, reply) => {
    if (!isSafeChangeId(req.params.id)) return reply.code(400).send({ error: "invalid change id" });
    if (!openspecDir) return reply.code(404).send({ error: "no openspec directory" });
    const changeDir = join(openspecDir, "changes", req.params.id);
    if (!existsSync(changeDir)) return reply.code(404).send({ error: "change not found" });

    const answer = typeof req.body?.answer === "string" ? req.body.answer.trim() : "";
    if (!answer) return reply.code(400).send({ error: "answer required" });

    const currentRaw = await readSidecar(getProjectRoot(), req.params.id);
    const current = extractSidecarFields(currentRaw, req.params.id);
    if (current.phase !== NEEDS_HUMAN) {
      return reply.code(409).send({ error: "change is not in needs-human" });
    }

    await appendAnswer(getProjectRoot(), req.params.id, answer);
    // Restore prior phase; clear escalation fields (undefined DELETES them
    // via the writeSidecar contract).
    const restored = current.priorPhase ?? "proposed";
    await writeSidecar(
      getProjectRoot(),
      req.params.id,
      { phase: restored, priorPhase: undefined, escalatedAt: undefined },
      watcher ?? undefined,
    );

    const change = await parseChange(openspecDir, req.params.id);
    broadcast({ type: "change-updated", changeId: req.params.id, change });
    return { ok: true, phase: restored };
  },
);

// ---- agent-runner endpoints ------------------------------------------------
fastify.get("/api/agents/config", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) return reply.code(403).send({ error: "local only" });
  return agentRegistry.publicConfig();
});

// Write endpoint (Phase 5.3: add-agents-config-write). Accepts an upsert
// or delete payload from the Agents tab modal and atomically rewrites
// agents.yaml. The registry's file watcher picks up the change and
// reloads on its own — no manual load() here.
fastify.post("/api/agents/config", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) {
    return reply.code(403).send({ error: "local only" });
  }
  const coerced = coercePayload(req.body);
  if ("error" in coerced) {
    return reply.code(400).send({ error: coerced.error });
  }
  const result = await applyAgentConfigPayload(getProjectRoot(), coerced);
  if (!result.ok) {
    return reply.code(result.status).send({ error: result.error });
  }
  // Force a synchronous reload so the immediately-following
  // `GET /api/agents/config` returns the just-written state. The
  // fs.watch-based auto-reload on registry.startWatching() is
  // asynchronous and can race the client's re-fetch on macOS
  // (rename events sometimes fire after a delay).
  await agentRegistry.load();
  return { ok: true };
});

// Parallel-execution config toggle (add-parallel-execution-config).
// Writes the top-level `parallelExecution: boolean` field in agents.yaml
// and reloads the registry so the change is reflected on next fetch.
fastify.post<{ Body: { value?: unknown } }>("/api/config/parallel-execution", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) {
    return reply.code(403).send({ error: "local only" });
  }
  const value = (req.body ?? {}).value;
  if (typeof value !== "boolean") {
    return reply.code(400).send({ error: "value must be a boolean" });
  }
  const result = await writeParallelExecution(getProjectRoot(), value);
  if (!result.ok) return reply.code(result.status).send({ error: result.error });
  // Registry reload — same rationale as /api/agents/config's POST handler:
  // watcher is best-effort, race with client refetch.
  await agentRegistry.load();
  return { ok: true };
});

// Agmsg config write endpoint (add-agmsg-config-write).
// Enable/disable and edit the top-level `agmsg:` block in agents.yaml.
// Follows the same shape as /api/config/parallel-execution.
fastify.post<{
  Body: { enabled?: unknown; team?: unknown; storage?: unknown };
}>("/api/config/agmsg", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) {
    return reply.code(403).send({ error: "local only" });
  }
  const body = req.body ?? {};
  if (typeof body.enabled !== "boolean") {
    return reply.code(400).send({ error: "enabled must be a boolean" });
  }
  let block: { team: string; storage?: string } | null;
  if (body.enabled) {
    if (typeof body.team !== "string" || body.team.length === 0) {
      return reply.code(400).send({
        error: "agmsg.team is required when the agmsg block is present",
      });
    }
    block = { team: body.team };
    if (body.storage !== undefined && body.storage !== null && body.storage !== "") {
      if (typeof body.storage !== "string") {
        return reply.code(400).send({ error: "agmsg.storage must be a string" });
      }
      block.storage = body.storage;
    }
  } else {
    block = null;
  }
  const result = await writeAgmsg(getProjectRoot(), block);
  if (!result.ok) return reply.code(result.status).send({ error: result.error });
  await agentRegistry.load();
  return { ok: true };
});

// Manager status endpoint (add-agents-tab-manager-section). Reflects
// the actual resolved PTY startup — so the Agents tab can be honest
// about what's running, even when no role:manager entry exists.
fastify.get("/api/manager/status", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) {
    return reply.code(403).send({ error: "local only" });
  }
  const managerEntry = agentRegistry.managerAgent();
  const resolved = ptyStartup(agentRegistry);
  let fallbackSource: "declared" | "env" | "default";
  if (managerEntry) {
    fallbackSource = "declared";
  } else if (process.env.ITHYNO_TERMINAL_STARTUP !== undefined) {
    fallbackSource = "env";
  } else {
    fallbackSource = "default";
  }
  // Public projection of the manager agent — mirror what /api/agents/config
  // returns for individual agents (strip env, add hasEnv).
  const agentEntry = managerEntry
    ? {
        name: managerEntry.name,
        description: managerEntry.description,
        command: managerEntry.command,
        args: managerEntry.args,
        hasEnv: !!managerEntry.env && Object.keys(managerEntry.env).length > 0,
        initialInput: managerEntry.initialInput,
        prompt: managerEntry.prompt,
        role: managerEntry.role,
      }
    : null;
  return {
    agentEntry,
    resolvedStartup: resolved.startup || null,
    initialInput: resolved.initialInput ?? null,
    fallbackSource,
    terminalActive: activeTerminalCount() > 0,
  };
});

fastify.get("/api/agents/jobs", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) return reply.code(403).send({ error: "local only" });
  return { jobs: agentRunner.listJobs() };
});

fastify.get<{ Params: { id: string } }>("/api/agents/jobs/:id", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) return reply.code(403).send({ error: "local only" });
  const job = agentRunner.getJob(req.params.id);
  if (!job) return reply.code(404).send({ error: "not found" });
  return job;
});

type RunBody = { changeId: string; agentName: string };
fastify.post<{ Body: RunBody }>("/api/agents/run", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) {
    req.log.warn({ addr: req.socket.remoteAddress }, "agents/run: non-local blocked");
    return reply.code(403).send({ error: "local only" });
  }
  const body = req.body;
  if (!body?.changeId || !body?.agentName) {
    req.log.warn({ body }, "agents/run: bad body");
    return reply.code(400).send({ error: "changeId and agentName required" });
  }
  const cfg = agentRegistry.publicConfig();
  if (cfg.agents.length === 0) {
    req.log.warn("agents/run: no agents in agents.yaml");
    return reply.code(503).send({ error: "no agents defined in agents.yaml" });
  }
  req.log.info({ changeId: body.changeId, agentName: body.agentName }, "agents/run: starting");
  const res = await agentRunner.run(body.changeId, body.agentName);
  if (!res.ok) {
    req.log.warn({ status: res.status, reason: res.reason, changeId: body.changeId }, "agents/run: failed");
    return reply.code(res.status).send({ error: res.reason });
  }
  req.log.info({ jobId: res.job.id, changeId: body.changeId }, "agents/run: ok");
  return res.job;
});

fastify.get<{ Params: { id: string } }>("/api/agents/jobs/:id/diff", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) return reply.code(403).send({ error: "local only" });
  const job = agentRunner.getJob(req.params.id);
  if (!job) return reply.code(404).send({ error: "not found" });
  // Cache for finished jobs only; running jobs change as the agent commits.
  if (job.status !== "running" && job.cachedDiff) {
    return job.cachedDiff as DiffPayload;
  }
  const diff = await extractDiff(getProjectRoot(), job.id, job.branch);
  if (job.status !== "running") job.cachedDiff = diff;
  return diff;
});

fastify.post<{ Params: { id: string } }>("/api/agents/jobs/:id/cancel", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) return reply.code(403).send({ error: "local only" });
  const res = agentRunner.cancel(req.params.id);
  if (!res.ok) return reply.code(400).send({ error: res.reason });
  return { ok: true };
});

// ---- tagging endpoints -----------------------------------------------------
fastify.get("/api/tags", async () => {
  const { index } = await collectTags(getProjectRoot());
  return index;
});

fastify.get<{ Params: { ns: string; "*": string } }>("/api/tags/:ns/*", async (req) => {
  const ns = decodeURIComponent(req.params.ns);
  const name = decodeURIComponent((req.params as any)["*"] ?? "");
  const tag = ns === "other" ? name : `${ns}/${name}`;
  return getTagDetail(getProjectRoot(), tag);
});

// ---- design-docs endpoints -------------------------------------------------
fastify.get("/api/docs", async () => scanDocs(getProjectRoot()));

fastify.get<{ Querystring: { path?: string } }>("/api/docs/file", async (req, reply) => {
  const p = req.query.path;
  if (!p) return reply.code(400).send({ error: "missing path" });
  const file = await readDocsFile(getProjectRoot(), p);
  if (!file) return reply.code(404).send({ error: "not found" });
  return file;
});

fastify.get<{ Querystring: { path?: string } }>("/api/file", async (req, reply) => {
  const p = req.query.path;
  if (!p || !withinOpenspec(p)) return reply.code(400).send({ error: "invalid path" });
  try {
    const content = await readFile(resolve(p), "utf8");
    return { path: resolve(p), content, hash: sha1(content) };
  } catch {
    return reply.code(404).send({ error: "not found" });
  }
});

type ToggleBody = {
  filePath: string;
  line: number;
  expectedText: string;
  baseHash: string;
  desiredChecked: boolean;
};

fastify.post<{ Body: ToggleBody }>("/api/tasks/toggle", async (req, reply) => {
  if (!openspecDir) return reply.code(404).send({ error: "no openspec directory" });
  const body = req.body;
  if (!body?.filePath || !withinOpenspec(body.filePath) || !body.filePath.endsWith(".md")) {
    return reply.code(400).send({ error: "invalid filePath" });
  }
  const filePath = resolve(body.filePath);

  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return reply.code(404).send({ error: "file not found" });
  }

  const result = applyToggle(content, {
    line: body.line,
    expectedText: body.expectedText,
    baseHash: body.baseHash,
    desiredChecked: body.desiredChecked,
  });

  // Determine whether this edit targets the main openspec dir or a worktree's.
  const worktreesRoot = resolve(getProjectRoot(), ".worktrees");
  const isWorktreePath = filePath.startsWith(worktreesRoot + sep);
  let worktreeOpenspecDir: string | null = null;
  let worktreeChangeId: string | null = null;
  if (isWorktreePath) {
    const rel = filePath.slice(worktreesRoot.length + 1);
    const worktreeId = rel.split(sep)[0];
    worktreeOpenspecDir = join(worktreesRoot, worktreeId, "openspec");
    worktreeChangeId = changeIdForPath(worktreeOpenspecDir, filePath);
  }
  const mainChangeId = isWorktreePath ? null : (openspecDir ? changeIdForPath(openspecDir, filePath) : null);
  const changeId = mainChangeId ?? worktreeChangeId;
  const reparse = async () => {
    if (worktreeOpenspecDir && worktreeChangeId) return parseChange(worktreeOpenspecDir, worktreeChangeId);
    if (openspecDir && mainChangeId) return parseChange(openspecDir, mainChangeId);
    return null;
  };

  if (result.status === "invalid") {
    return reply.code(400).send({ status: "invalid", reason: result.reason, change: await reparse() });
  }
  if (result.status === "conflict") {
    return reply.code(409).send({ status: "conflict", reason: result.reason, change: await reparse() });
  }

  // Apply the surgical edit, then record the hash so the watcher ignores it.
  if (result.newContent !== content) {
    await writeFile(filePath, result.newContent, "utf8");
    watcher?.recordWrite(filePath, result.newHash);
  }

  const change = await reparse();
  if (changeId && change) {
    broadcast(
      isWorktreePath
        ? { type: "worktree-change-updated", changeId, change }
        : { type: "change-updated", changeId, change },
    );
  }

  return {
    status: "ok",
    newHash: result.newHash,
    editedLine: result.editedLine,
    newLineText: result.newLineText,
    change,
  };
});

// Inject text into the most recently active embedded terminal. Local-only.
// The endpoint writes verbatim to the PTY — Claude Code (running in that
// terminal) executes whatever ends up on its prompt. No shell-quoting here;
// callers send the exact line they want typed.
type InjectBody = { data: string; terminate?: boolean };
fastify.post<{ Body: InjectBody }>("/api/pty/inject", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) {
    return reply.code(403).send({ error: "local clients only" });
  }
  const body = req.body;
  if (!body || typeof body.data !== "string" || body.data.length === 0) {
    return reply.code(400).send({ error: "invalid body" });
  }
  if (body.data.length > 8192) {
    return reply.code(400).send({ error: "data too long" });
  }
  const terminate = body.terminate !== false;
  const result = injectIntoActive(body.data, terminate);
  if (!result.ok) {
    return reply.code(409).send({ status: "no-terminal", reason: result.reason });
  }
  return { status: "ok", activeTerminals: activeTerminalCount() };
});

// ---- Import spec-generation endpoint (refactor-import-to-task-tool-subagent) -
// POST /api/import/spec-generation — preflight + inject to Manager PTY
// Enhanced by enable-import-both-patterns:
//   - Doctor gate (409 when readyForManager false)
//   - Import job registry (TTL 1h, max 20, 429 on cap)
//   - Pattern A/B classification; response includes `pattern`
//   - Pattern A: registers ImportTargetWatcher; broadcasts `import-completed`
{
  const { preflight: importPreflight, injectImportCommand } =
    await import("./import-spec-gen.js");
  const { registerImportJob, deleteImportJob, setOnExpire } =
    await import("./import-jobs.js");
  const { ImportTargetWatcher } =
    await import("./sync/watcher.js");
  const { runDoctor } =
    await import("./doctor.js");

  /**
   * Active Pattern A watchers keyed by jobId. Stored so stop() can be called
   * on TTL sweep or job cancellation (future extension point).
   */
  const importWatchers = new Map<string, InstanceType<typeof ImportTargetWatcher>>();

  // A2 (enable-import-both-patterns review round 1): TTL sweep in
  // import-jobs.ts calls this back for each expired jobId so we can stop
  // the orphaned ImportTargetWatcher and free the chokidar handle.
  setOnExpire((jobId: string) => {
    const w = importWatchers.get(jobId);
    if (w) {
      void w.stop();
      importWatchers.delete(jobId);
    }
  });

  /**
   * Determine whether a given absolute path is authorized for import.
   * We allow any path that doesn't start with a system directory.
   * The primary security gate is localhost-only network access; this
   * blocklist provides defense-in-depth for system paths.
   */
  function isAuthorizedImportPath(absPath: string): boolean {
    if (!absPath || !absPath.startsWith("/")) return false;
    const forbidden = [
      // Linux system dirs
      "/etc", "/sys", "/proc", "/dev", "/bin", "/sbin",
      "/usr/bin", "/usr/sbin", "/usr/local",
      // macOS system dirs
      "/Library", "/private", "/var", "/opt",
      // Root's home
      "/root",
      // System frameworks (macOS)
      "/System",
    ];
    for (const f of forbidden) {
      if (absPath === f || absPath.startsWith(f + "/")) return false;
    }
    return true;
  }

  // ---- POST /api/project/switch (respawn-manager-pty-on-project-switch) ----
  type ProjectSwitchBody = { projectRoot?: unknown };
  fastify.post<{ Body: ProjectSwitchBody }>("/api/project/switch", async (req, reply) => {
    if (!isLocal(req.socket.remoteAddress ?? undefined)) {
      return reply.code(403).send({ error: "local only" });
    }
    if (projectSwitchInProgress) {
      return reply.code(409).send({ error: "A project switch is already in progress." });
    }
    const body = req.body ?? {};
    const next = body.projectRoot;
    if (typeof next !== "string" || next.length === 0) {
      return reply.code(400).send({ error: "`projectRoot` is required and must be a non-empty string" });
    }
    if (!next.startsWith("/")) {
      return reply.code(400).send({ error: "`projectRoot` must be an absolute path" });
    }
    if (!isAuthorizedImportPath(next)) {
      return reply.code(403).send({ error: `Path is not authorized: ${next}` });
    }
    let stat: import("node:fs").Stats;
    try {
      stat = statSync(next);
    } catch {
      return reply.code(400).send({ error: `Path does not exist: ${next}` });
    }
    if (!stat.isDirectory()) {
      return reply.code(400).send({ error: `Path is not a directory: ${next}` });
    }
    // Normalize via realpath so a symlinked project root still matches
    // equally-resolved comparisons downstream (matches the boot-time
    // PROJECT_ROOT resolution shape).
    let resolvedNext = next;
    try { resolvedNext = realpathSync(next, { encoding: "utf8" }); } catch { /* keep next */ }

    projectSwitchInProgress = true;
    try {
      terminateAllLivePtys();
      setProjectRoot(resolvedNext);
      broadcast({ type: "state-replaced" });
      return reply.code(200).send({ projectRoot: resolvedNext });
    } finally {
      projectSwitchInProgress = false;
    }
  });

  type ImportBody = { projectRoot?: unknown; force?: unknown; dry?: unknown };
  fastify.post<{ Body: ImportBody }>("/api/import/spec-generation", async (req, reply) => {
    if (!isLocal(req.socket.remoteAddress ?? undefined)) {
      return reply.code(403).send({ error: "local only" });
    }
    const body = req.body ?? {};
    if (typeof body.projectRoot !== "string" || !body.projectRoot) {
      return reply.code(400).send({ error: "`projectRoot` is required" });
    }
    const force = body.force === true;
    const dry = body.dry === true;

    // ---- Doctor gate (enable-import-both-patterns task 3.1) ---------------
    // Reject with 409 when no agent CLI is installed — clearer than 503 and
    // fires before any Manager check so the user knows the prerequisite gap.
    const doctor = await runDoctor();
    if (!doctor.readyForManager) {
      return reply.code(409).send({
        error:
          "No agent CLI (claude, codex, agy, …) found on PATH. " +
          "Install one and verify it is available, then retry. " +
          "See Settings > Prerequisites (doctor) for details.",
      });
    }

    const result = await importPreflight(body.projectRoot, force, isAuthorizedImportPath);
    if (!result.ok) {
      return reply.code(result.status).send({ error: result.reason });
    }

    // ---- Pattern classification (enable-import-both-patterns task 2.3) ---
    const { targetPath, jobId } = result.result;
    // Resolve symlinks so a symlinked project root still classifies as Pattern B.
    let realTarget = targetPath;
    try { realTarget = realpathSync(targetPath, { encoding: "utf8" }); } catch { /* keep targetPath */ }
    const pattern: "A" | "B" = realTarget === getProjectRoot() ? "B" : "A";

    // Dry-run: return preflight info + pattern without dispatching
    if (dry) {
      return reply.code(202).send({ ...result.result, pattern, dry: true });
    }

    // ---- Register import job (task 3.3) ------------------------------------
    const regResult = registerImportJob({
      jobId,
      targetPath,
      startedAt: Date.now(),
      pattern,
    });
    if (!regResult.ok) {
      return reply.code(regResult.status).send({ error: regResult.reason });
    }

    // ---- Inject `/ithy-opsx:import <targetPath>` into the Manager PTY -----
    // injectImportCommand validates the path for control characters (→ 400)
    // and then routes to the Manager PTY by cwd (→ 503 when not running).
    const managerCwd = getProjectRoot();
    const injectResult = injectImportCommand(
      targetPath,
      (data, terminate) => injectIntoManager(managerCwd, data, terminate),
    );
    if (!injectResult.ok) {
      // Roll back the registered job — inject failed before dispatch.
      deleteImportJob(jobId);
      const statusCode = (injectResult as { status?: number }).status === 400 ? 400 : 503;
      const msg =
        statusCode === 400
          ? injectResult.reason
          : `Manager PTY not running; add agents.yaml to the ithyno project root and restart ithyno. (${injectResult.reason})`;
      return reply.code(statusCode).send({ error: msg });
    }

    // ---- Pattern A: register ImportTargetWatcher (task 3.4 / task 1.2) ---
    if (pattern === "A" && !importWatchers.has(jobId)) {
      const tw = new ImportTargetWatcher(targetPath, jobId, ({ targetPath: tp, jobId: jid }) => {
        // Broadcast import-completed WS event (task 4.2).
        broadcast({ type: "import-completed", jobId: jid, targetPath: tp, pattern: "A" });
        // Clean up job registry and watcher map.
        deleteImportJob(jid);
        importWatchers.delete(jid);
      });
      importWatchers.set(jobId, tw);
      tw.start();
    }

    return reply.code(202).send({ ...result.result, pattern });
  });
}

// ---- Static (production) + SPA fallback ------------------------------------
const webDist = join(PKG_ROOT, "web", "dist");
if (!DEV && existsSync(webDist)) {
  await fastify.register(fastifyStatic, { root: webDist });
  // SPA fallback: any non-/api GET resolves to index.html so deep links
  // (/change/:id) survive a hard reload (§ roadmap phase 4).
  fastify.setNotFoundHandler((req, reply) => {
    if (req.method === "GET" && !req.url.startsWith("/api")) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: "not found" });
  });
}

// ---- WebSocket upgrade ------------------------------------------------------
fastify.server.on("upgrade", (request, socket, head) => {
  const path = request.url?.split("?")[0];

  // CSRF gate: both /ws and /pty require the session token (in query) and a
  // valid Origin. Without this, a malicious page open in the user's browser
  // could open our WebSocket and either drink state updates or — for /pty —
  // pump bytes into the terminal.
  if (path === "/ws" || path === "/pty") {
    const authRes = checkAuthWs(
      { url: request.url, headers: request.headers as Record<string, string | string[] | undefined> },
      ORIGIN_ALLOW,
    );
    if (!authRes.ok) {
      socket.destroy();
      return;
    }
  }

  if (path === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
  } else if (path === "/pty") {
    // The PTY exposes a real shell — also keep the local-only network check.
    if (!isLocal(request.socket.remoteAddress ?? undefined)) {
      socket.destroy();
      return;
    }
    ptyWss.handleUpgrade(request, socket, head, (ws) => ptyWss.emit("connection", ws, request));
  } else {
    socket.destroy();
  }
});

ptyWss.on("connection", async (ws) => {
  const cwd = openspecDir
    ? resolve(openspecDir, "..") // project root, not openspec/ itself
    : getProjectRoot();
  const result = await attachPtyToSocket(ws, { cwd, registry: agentRegistry });
  if (!result.ok) {
    try {
      ws.send(`\r\n[ithyno] terminal unavailable: ${result.reason}\r\n`);
    } catch {
      /* ignore */
    }
    ws.close();
  }
});

// ---- Boot ------------------------------------------------------------------
try {
  // Stale worktree lock cleanup — see server/agents/worktree-lock.ts.
  // Runs before we start serving so the first workspace scan sees the
  // clean state.
  const { cleanupStaleLock } = await import("./agents/worktree-lock.js");
  const cleaned = await cleanupStaleLock(getProjectRoot());
  if (cleaned === null) {
    // Either no lock existed, or we just removed a stale one. Either
    // way, the current state is "no lock held" — nothing to log unless
    // we actually removed something. cleanupStaleLock does not
    // currently report which case; if we care, extend the return type.
  }

  await fastify.listen({ port: PORT, host: "127.0.0.1" });
  // Rebuild the allow-list against the final port (in case it differs from the
  // requested PORT in some edge case).
  ORIGIN_ALLOW = buildOriginAllowList(PORT, DEV_EXTRA_ORIGINS);
  const launchUrl = `http://localhost:${PORT}/?token=${SESSION_TOKEN}`;
  if (!openspecDir) {
    console.log(`⚠  No openspec/ directory found under ${getProjectRoot()}`);
    console.log(`   Run this from an OpenSpec project root, or use --dir <path>.`);
  } else {
    console.log(`✔  ithyno watching ${openspecDir}`);
  }
  if (DEV) {
    console.log(`✔  API server on http://localhost:${PORT}  (UI dev: http://localhost:5173/?token=${SESSION_TOKEN})`);
  } else {
    console.log(`✔  ithyno on ${launchUrl}`);
    if (SHOULD_OPEN) {
      const { default: open } = await import("open");
      await open(launchUrl);
    }
  }
} catch (err) {
  console.error(err);
  process.exit(1);
}
