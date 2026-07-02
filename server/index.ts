import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { WebSocketServer, WebSocket } from "ws";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";
import { resolveOpenspecDir, scanWorkspace, parseChange, changeIdForPath } from "./parser/workspace.js";
import { parseSpec } from "./parser/spec.js";
import { scanDocs, readDocsFile, docsRelPath } from "./parser/docs.js";
import { collectTags, getTagDetail } from "./parser/tags.js";
import { applyToggle } from "./sync/surgicalEdit.js";
import { Watcher } from "./sync/watcher.js";
import { loadPty, attachPtyToSocket, injectIntoActive, activeTerminalCount } from "./sync/pty.js";
import { AgentRegistry } from "./agents/registry.js";
import { AgentRunner, type JobSummary, type JobStatus } from "./agents/runner.js";
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");

const PORT = Number(process.env.PORT ?? 4321);
const PROJECT_ROOT = resolve(process.env.OPENSPEC_PROJECT_ROOT ?? process.cwd());
const DEV = process.env.OPENSPEC_DEV === "1";
const SHOULD_OPEN = process.env.OPENSPEC_OPEN === "1";

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
  | { type: "spec-updated"; domain: string; spec: SpecDomain }
  | { type: "doc-updated"; path: string; file: DocsFile | null; tree: DocsTree }
  | { type: "tags-updated" }
  | { type: "agent-job-started"; job: JobSummary }
  | { type: "agent-job-output"; jobId: string; chunk: string; stream: "stdout" | "stderr" | "stdin" }
  | { type: "agent-job-finished"; jobId: string; status: JobStatus; exitCode: number | null }
  | { type: "worktree-progress-updated"; jobId: string; changeId: string; progress: { done: number; total: number } }
  | { type: "git-status-updated"; gitStatus: GitStatus };

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
const agentRunner = new AgentRunner(PROJECT_ROOT, agentRegistry, (ev) => broadcast(ev));
// Adopt any `.worktrees/<change-id>/` sitting on disk into the runner's
// job map so the Kanban card can offer Merge/Discard without the user
// having to shell out. Awaited so that the very first `/api/agents/jobs`
// response and the initial `/api/state` a reconnecting client sees
// already include the adopted orphans — otherwise the client races with
// this init and misses the one-shot `agent-job-started` events.
// See add-orphan-worktree-adoption.
await agentRunner.adoptOrphanWorktrees();
void agentRegistry.startWatching();

process.on("SIGINT", () => {
  agentRunner.shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  agentRunner.shutdown();
  process.exit(0);
});

// ---- Helpers ---------------------------------------------------------------
function withinOpenspec(filePath: string): boolean {
  if (!openspecDir) return false;
  const abs = resolve(filePath);
  return abs === openspecDir || abs.startsWith(openspecDir + sep);
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

// ---- agent-runner endpoints ------------------------------------------------
fastify.get("/api/agents/config", async (req, reply) => {
  if (!isLocal(req.socket.remoteAddress ?? undefined)) return reply.code(403).send({ error: "local only" });
  return agentRegistry.publicConfig();
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

type InputBody = { data?: string; appendNewline?: boolean };
fastify.post<{ Params: { id: string }; Body: InputBody }>(
  "/api/agents/jobs/:id/input",
  async (req, reply) => {
    if (!isLocal(req.socket.remoteAddress ?? undefined)) {
      return reply.code(403).send({ error: "local only" });
    }
    const data = req.body?.data;
    if (typeof data !== "string") {
      return reply.code(400).send({ error: "data (string) is required" });
    }
    const appendNewline = req.body?.appendNewline ?? true;
    const res = agentRunner.writeInput(req.params.id, data, appendNewline);
    if (!res.ok) return reply.code(res.status).send({ error: res.reason });
    return { ok: true };
  },
);

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

  const changeId = changeIdForPath(openspecDir, filePath);
  const reparse = async () => (changeId ? parseChange(openspecDir, changeId) : null);

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
  if (changeId && change) broadcast({ type: "change-updated", changeId, change });

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
  const result = await attachPtyToSocket(ws, { cwd });
  if (!result.ok) {
    try {
      ws.send(`\r\n[openspec-ui] terminal unavailable: ${result.reason}\r\n`);
    } catch {
      /* ignore */
    }
    ws.close();
  }
});

// ---- Boot ------------------------------------------------------------------
try {
  await fastify.listen({ port: PORT, host: "127.0.0.1" });
  // Rebuild the allow-list against the final port (in case it differs from the
  // requested PORT in some edge case).
  ORIGIN_ALLOW = buildOriginAllowList(PORT, DEV_EXTRA_ORIGINS);
  const launchUrl = `http://localhost:${PORT}/?token=${SESSION_TOKEN}`;
  if (!openspecDir) {
    console.log(`⚠  No openspec/ directory found under ${PROJECT_ROOT}`);
    console.log(`   Run this from an OpenSpec project root, or use --dir <path>.`);
  } else {
    console.log(`✔  OpenSpec UI watching ${openspecDir}`);
  }
  if (DEV) {
    console.log(`✔  API server on http://localhost:${PORT}  (UI dev: http://localhost:5173/?token=${SESSION_TOKEN})`);
  } else {
    console.log(`✔  OpenSpec UI on ${launchUrl}`);
    if (SHOULD_OPEN) {
      const { default: open } = await import("open");
      await open(launchUrl);
    }
  }
} catch (err) {
  console.error(err);
  process.exit(1);
}
