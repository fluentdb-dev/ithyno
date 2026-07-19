// SPDX-License-Identifier: GPL-3.0-or-later
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { WebSocketServer, WebSocket } from "ws";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, resolve, sep } from "node:path";
import { resolveOpenspecDir, scanWorkspace, parseChange, changeIdForPath } from "./parser/workspace.js";
import { parseSpec } from "./parser/spec.js";
import { scanDocs, readDocsFile, docsRelPath } from "./parser/docs.js";
import { collectTags, getTagDetail } from "./parser/tags.js";
import { applyToggle } from "./sync/surgicalEdit.js";
import { Watcher } from "./sync/watcher.js";
import { loadPty, attachPtyToSocket, injectIntoActive, activeTerminalCount, ptyStartup } from "./sync/pty.js";
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
const PROJECT_ROOT = resolve(process.env.ITHYNO_PROJECT_ROOT ?? process.cwd());
const DEV = process.env.ITHYNO_DEV === "1";
const SHOULD_OPEN = process.env.ITHYNO_OPEN === "1";

const openspecDir = resolveOpenspecDir(PROJECT_ROOT);

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
  | {
      type: "agents-updated";
      ok: boolean;
      error?: string;
      agents: Array<Omit<AgentDef, "env"> & { hasEnv: boolean }>;
      parallelExecution: boolean;
      agmsg: import("./agents/registry.js").AgmsgConfig | null;
      warnings: string[];
    };

function broadcast(event: ServerEvent): void {
  const payload = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

// ---- Echo-suppressing file watcher ----------------------------------------
let watcher: Watcher | null = null;
if (openspecDir) {
  watcher = new Watcher(openspecDir, async (filePath, event) => {
    try {
      // Any markdown change under openspec/ may have updated frontmatter tags.
      if (filePath.endsWith(".md")) broadcast({ type: "tags-updated" });
      const changeId = changeIdForPath(openspecDir, filePath);
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
          dirname(filePath) === join(openspecDir, "changes", changeId);
        if (event !== "unlink" && isDirectNeedsHuman) {
          const raw = await readSidecar(PROJECT_ROOT, changeId);
          const cur = extractSidecarFields(raw, changeId);
          if (cur.phase === NEEDS_HUMAN) {
            const doc = await parseNeedsHuman(PROJECT_ROOT, changeId);
            if (doc?.answered) {
              const restored = cur.priorPhase ?? "proposed";
              await writeSidecar(PROJECT_ROOT, changeId, {
                phase: restored,
                priorPhase: undefined,
                escalatedAt: undefined,
              }, watcher ?? undefined);
            }
          }
        }
        const change = await parseChange(openspecDir, changeId);
        broadcast({ type: "change-updated", changeId, change });
        return;
      }
      // specs/<domain>/spec.md or anything else: re-broadcast a top-level spec.
      const specsPrefix = join(openspecDir, "specs") + sep;
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

// Second watcher for the design-docs space (`docs/`). Reuses the same Watcher
// class with echo suppression; it just points at a different root.
const DOCS_DIR = join(PROJECT_ROOT, "docs");
let docsWatcher: Watcher | null = null;
if (existsSync(DOCS_DIR)) {
  docsWatcher = new Watcher(DOCS_DIR, async (filePath) => {
    try {
      const relPath = docsRelPath(PROJECT_ROOT, filePath);
      const tree = await scanDocs(PROJECT_ROOT);
      let file: DocsFile | null = null;
      if (relPath) file = await readDocsFile(PROJECT_ROOT, relPath);
      broadcast({ type: "doc-updated", path: relPath ?? "", file, tree });
      broadcast({ type: "tags-updated" });
    } catch {
      /* swallow */
    }
  });
  docsWatcher.start();
}

// ---- Agent runner ----------------------------------------------------------
const agentRegistry = new AgentRegistry(PROJECT_ROOT);
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
const agentRunner = new AgentRunner(PROJECT_ROOT, agentRegistry, (ev) => broadcast(ev));
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
  const worktreesRoot = resolve(PROJECT_ROOT, ".worktrees");
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
    projectRoot: PROJECT_ROOT,
    terminal: pty.available
      ? { available: true as const }
      : { available: false as const, reason: pty.reason },
  };
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

fastify.get("/api/state", async () => scanWorkspace(openspecDir, PROJECT_ROOT));

// ---- git identity ----------------------------------------------------------
fastify.get("/api/git/status", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) return reply.code(403).send({ error: "local only" });
  return getGitStatus(PROJECT_ROOT);
});

fastify.get("/api/git/config", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) return reply.code(403).send({ error: "local only" });
  const status = await getGitStatus(PROJECT_ROOT);
  if (!status.isRepo) return reply.code(409).send({ error: "not a git repository" });
  return readGitConfig(PROJECT_ROOT);
});

type GitConfigBody = { userName?: string; userEmail?: string };
fastify.post<{ Body: GitConfigBody }>("/api/git/config", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) return reply.code(403).send({ error: "local only" });
  const body = req.body ?? {};
  if (body.userName === undefined && body.userEmail === undefined) {
    return reply.code(400).send({ error: "at least one of userName / userEmail required" });
  }
  const status = await getGitStatus(PROJECT_ROOT);
  if (!status.isRepo) return reply.code(409).send({ error: "not a git repository — run /api/git/init first" });
  try {
    await writeLocalConfig(PROJECT_ROOT, body);
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
    const gitStatus = await gitInit(PROJECT_ROOT);
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
// runInit directly instead (agmsg-installer pattern); this endpoint remains
// for browser mode and as a fallback.
type InitBody = {
  dir?: unknown;
  force?: unknown;
  skipGitignore?: unknown;
  autoCreateDir?: unknown;
  autoGitInit?: unknown;
};
fastify.post<{ Body: InitBody }>("/api/init", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) {
    return reply.code(403).send({ error: "local only" });
  }
  const body = req.body ?? {};
  if (typeof body.dir !== "string" || body.dir.length === 0) {
    return reply.code(400).send({ ok: false, reason: "`dir` is required and must be a string" });
  }
  // Reject relative paths — resolving against the server cwd is ambiguous.
  const { isAbsolute } = await import("node:path");
  if (!isAbsolute(body.dir)) {
    return reply.code(400).send({ ok: false, reason: "`dir` must be an absolute path" });
  }
  const { runInit } = await import("../bin/init.js");
  const result = await runInit({
    targetDir: body.dir,
    force: body.force === true,
    skipGitignore: body.skipGitignore === true,
    autoCreateDir: body.autoCreateDir === true,
    autoGitInit: body.autoGitInit === true,
    quiet: true,
  });
  if (!result.ok) {
    // Preflight failure → surface with 500 + full runInit shape.
    return reply.code(500).send(result);
  }
  return result;
});

fastify.get<{ Params: { id: string }; Querystring: { tree?: string } }>(
  "/api/changes/:id",
  async (req, reply) => {
    if (!openspecDir) return reply.code(404).send({ error: "no openspec directory" });
    if (req.query?.tree === "worktree") {
      // add-worktree-change-view: serve from `.worktrees/<id>/openspec/` so
      // the dashboard can render the running agent's live tasks.md, proposal
      // edits, delta specs — anything the agent has touched on its branch.
      const worktreeOpenspec = join(PROJECT_ROOT, ".worktrees", req.params.id, "openspec");
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
    return getChangeGitState(PROJECT_ROOT, req.params.id);
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
      const { commitHash } = await commitChangeProposal(PROJECT_ROOT, req.params.id);
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
    const raw = await readSidecar(PROJECT_ROOT, req.params.id);
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
      PROJECT_ROOT,
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
    const currentRaw = await readSidecar(PROJECT_ROOT, req.params.id);
    const current = extractSidecarFields(currentRaw, req.params.id);
    if (current.phase === NEEDS_HUMAN) {
      return reply.code(409).send({ error: "change already escalated" });
    }

    const priorPhase = current.phase ?? "proposed";
    const escalatedAt = new Date().toISOString();
    await writeNeedsHuman(PROJECT_ROOT, req.params.id, question, context);
    await writeSidecar(
      PROJECT_ROOT,
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

    const currentRaw = await readSidecar(PROJECT_ROOT, req.params.id);
    const current = extractSidecarFields(currentRaw, req.params.id);
    if (current.phase !== NEEDS_HUMAN) {
      return reply.code(409).send({ error: "change is not in needs-human" });
    }

    await appendAnswer(PROJECT_ROOT, req.params.id, answer);
    // Restore prior phase; clear escalation fields (undefined DELETES them
    // via the writeSidecar contract).
    const restored = current.priorPhase ?? "proposed";
    await writeSidecar(
      PROJECT_ROOT,
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
  const result = await applyAgentConfigPayload(PROJECT_ROOT, coerced);
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
  const result = await writeParallelExecution(PROJECT_ROOT, value);
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
  const result = await writeAgmsg(PROJECT_ROOT, block);
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
  const diff = await extractDiff(PROJECT_ROOT, job.id, job.branch);
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
  const { index } = await collectTags(PROJECT_ROOT);
  return index;
});

fastify.get<{ Params: { ns: string; "*": string } }>("/api/tags/:ns/*", async (req) => {
  const ns = decodeURIComponent(req.params.ns);
  const name = decodeURIComponent((req.params as any)["*"] ?? "");
  const tag = ns === "other" ? name : `${ns}/${name}`;
  return getTagDetail(PROJECT_ROOT, tag);
});

// ---- design-docs endpoints -------------------------------------------------
fastify.get("/api/docs", async () => scanDocs(PROJECT_ROOT));

fastify.get<{ Querystring: { path?: string } }>("/api/docs/file", async (req, reply) => {
  const p = req.query.path;
  if (!p) return reply.code(400).send({ error: "missing path" });
  const file = await readDocsFile(PROJECT_ROOT, p);
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
  const worktreesRoot = resolve(PROJECT_ROOT, ".worktrees");
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
    : PROJECT_ROOT;
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
  const cleaned = await cleanupStaleLock(PROJECT_ROOT);
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
    console.log(`⚠  No openspec/ directory found under ${PROJECT_ROOT}`);
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
