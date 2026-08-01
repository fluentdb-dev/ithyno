// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  AgentConfigPayload,
  AgentConfigResponse,
  Change,
  Cli,
  DiffPayload,
  DoctorReport,
  DocsFile,
  DocsTree,
  GitConfig,
  GitIdentity,
  GitStatus,
  Job,
  JobSummary,
  ManagerActivity,
  ManagerStatus,
  TagDetail,
  TagIndex,
  ToggleResponse,
  WorkspaceState,
} from "./types";
import { getSessionToken } from "./runtime";
import { isVsCodeShell, postToVsCode } from "./runtime/shell";

/**
 * Thrown when the server returns 401 / 403 with an auth-related reason.
 * Callers can let this bubble; the App-level effect surfaces the banner.
 */
export class AuthExpiredError extends Error {
  constructor(public readonly status: number, message = "Session expired") {
    super(message);
    this.name = "AuthExpiredError";
  }
}

let onAuthExpired: (() => void) | null = null;
export function onAuthExpiredHandler(fn: () => void): void {
  onAuthExpired = fn;
}
/** Fire the auth-expired handler from outside `postJson` (e.g. from the WS
 *  reconnect loop when repeated closes suggest the session token is stale). */
export function triggerAuthExpired(): void {
  onAuthExpired?.();
}

/**
 * Verify the stored session token against the server. Used at App mount to
 * detect a stale token without waiting for a mutating action.
 */
export async function checkAuth(): Promise<boolean> {
  const token = getSessionToken();
  if (!token) return false;
  try {
    const res = await fetch("/api/auth/check", {
      headers: { "X-Session-Token": token },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function authHeaders(): Record<string, string> {
  const token = getSessionToken();
  const h: Record<string, string> = { "content-type": "application/json" };
  if (token) h["X-Session-Token"] = token;
  return h;
}

/** POST helper used by every mutating call. Handles auth headers + 401/403. */
async function postJson<T>(url: string, body: unknown): Promise<{ status: number; data: T }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`[api] POST ${url} network error:`, err);
    throw err;
  }
  if (res.status === 401 || res.status === 403) {
    // Distinguish auth failures from other 4xx (e.g. /api/agents/run's 403 for
    // non-local clients, which can't happen from the UI anyway). We treat any
    // 401/403 on a mutating call as session-expired and let the banner surface.
    console.warn(`[api] POST ${url} auth failed (${res.status})`);
    onAuthExpired?.();
    throw new AuthExpiredError(res.status);
  }
  const data = (await res.json().catch(() => ({}))) as T;
  if (res.status >= 400) {
    console.warn(`[api] POST ${url} → ${res.status}`, data);
  }
  return { status: res.status, data };
}

export async function fetchState(): Promise<WorkspaceState> {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error(`GET /api/state failed: ${res.status}`);
  return res.json();
}

export async function fetchChange(
  id: string,
  opts?: { tree?: "worktree" },
): Promise<Change> {
  const query = opts?.tree === "worktree" ? "?tree=worktree" : "";
  const res = await fetch(`/api/changes/${encodeURIComponent(id)}${query}`);
  if (!res.ok) {
    // Preserve the status so callers can distinguish 404 (worktree gone)
    // from other failures.
    const err = new Error(`GET /api/changes/${id}${query} failed: ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return res.json();
}

/** Persist the chosen execution mode into the proposal's frontmatter. */
export async function setProposalExecution(id: string, mode: "worktree" | "terminal"): Promise<void> {
  const { status, data } = await postJson<{ status?: string; error?: string }>(
    `/api/changes/${encodeURIComponent(id)}/proposal/execution`,
    { mode },
  );
  if (status >= 400) throw new Error(data.error ?? `HTTP ${status}`);
}

/** Set the workflow phase for a change (add-phase-state-machine). */
export async function setChangePhase(id: string, phase: string): Promise<void> {
  const { status, data } = await postJson<{ ok?: boolean; error?: string }>(
    `/api/changes/${encodeURIComponent(id)}/phase`,
    { phase },
  );
  if (status >= 400) throw new Error(data.error ?? `HTTP ${status}`);
}

/**
 * Escalate a change to the needs-human state (add-needs-human-phase).
 * Writes `needs-human.md`, sets `phase: needs-human`, records
 * `priorPhase` and `escalatedAt` in the sidecar.
 */
export async function escalateChange(
  id: string,
  question: string,
  context?: string,
): Promise<void> {
  const { status, data } = await postJson<{ ok?: boolean; error?: string }>(
    `/api/changes/${encodeURIComponent(id)}/needs-human`,
    { question, context },
  );
  if (status >= 400) throw new Error(data.error ?? `HTTP ${status}`);
}

/** Answer an open escalation; restores the change's prior phase. */
export async function answerEscalation(id: string, answer: string): Promise<void> {
  const { status, data } = await postJson<{ ok?: boolean; error?: string }>(
    `/api/changes/${encodeURIComponent(id)}/needs-human/answer`,
    { answer },
  );
  if (status >= 400) throw new Error(data.error ?? `HTTP ${status}`);
}

export async function toggleTask(input: {
  filePath: string;
  line: number;
  expectedText: string;
  baseHash: string;
  desiredChecked: boolean;
}): Promise<ToggleResponse> {
  // 409 (conflict) and 400 (invalid) carry a useful body too — postJson
  // surfaces the body for any non-auth status.
  const { data } = await postJson<ToggleResponse>("/api/tasks/toggle", input);
  return data;
}

export async function fetchDocs(): Promise<DocsTree> {
  const res = await fetch("/api/docs");
  if (!res.ok) throw new Error(`GET /api/docs failed: ${res.status}`);
  return res.json();
}

export async function fetchTagIndex(): Promise<TagIndex> {
  const res = await fetch("/api/tags");
  if (!res.ok) throw new Error(`GET /api/tags failed: ${res.status}`);
  return res.json();
}

/**
 * Fetch artifacts for a tag. The endpoint shape is `/api/tags/:ns/<name-with-slashes>`,
 * with the `name` portion URL-encoded as a whole. For an "other"-namespace tag
 * (no prefix), pass ns="other".
 */
export async function fetchTagDetail(ns: string, name: string): Promise<TagDetail> {
  const res = await fetch(`/api/tags/${encodeURIComponent(ns)}/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`GET /api/tags/${ns}/${name} failed: ${res.status}`);
  return res.json();
}

export async function fetchDocFile(path: string): Promise<DocsFile | null> {
  const res = await fetch(`/api/docs/file?path=${encodeURIComponent(path)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /api/docs/file failed: ${res.status}`);
  return res.json();
}

// ---- start (worktree) uncommitted-proposal guard --------------------------
export async function fetchChangeGitState(
  id: string,
): Promise<{ untracked: string[]; modified: string[] }> {
  const res = await fetch(`/api/changes/${encodeURIComponent(id)}/git-state`);
  if (!res.ok) throw new Error(`GET /api/changes/${id}/git-state failed: ${res.status}`);
  return res.json();
}

export async function commitChangeProposal(id: string): Promise<{ commitHash: string }> {
  const { status, data } = await postJson<{ ok?: boolean; commitHash?: string; reason?: string; error?: string }>(
    `/api/changes/${encodeURIComponent(id)}/commit-proposal`,
    {},
  );
  if (status >= 400 || !data.commitHash) {
    throw new Error(data.reason ?? data.error ?? `HTTP ${status}`);
  }
  return { commitHash: data.commitHash };
}

// ---- agent-runner ----------------------------------------------------------
export async function fetchAgentConfig(): Promise<AgentConfigResponse> {
  const res = await fetch("/api/agents/config");
  if (!res.ok) throw new Error(`GET /api/agents/config failed: ${res.status}`);
  return res.json();
}

/**
 * Write agents.yaml via `POST /api/agents/config`. The endpoint lands
 * in Phase 5.3 (`add-agents-config-write`) — until then a 404 is
 * expected. Callers should surface a toast with a hint about the
 * missing endpoint.
 */
/**
 * Fetch the resolved Manager status (add-agents-tab-manager-section):
 * the `role: manager` agents.yaml entry if declared, plus the actual
 * PTY startup command that would run and whether the Terminal panel
 * is currently open. Powers the Manager section on the Agents tab.
 */
export async function fetchManagerStatus(): Promise<ManagerStatus> {
  const res = await fetch("/api/manager/status");
  if (!res.ok) throw new Error(`GET /api/manager/status failed: ${res.status}`);
  return res.json();
}

/**
 * Bulk snapshot of per-change Manager activity (expose-manager-activity-per-change).
 *
 * Session-token gated (the endpoint is written only by the dispatch skill).
 * The state is in-memory server-side, so this legitimately returns `{}` right
 * after a server restart — callers must treat "empty" as normal, not an error.
 */
export async function fetchManagerActivities(): Promise<Record<string, ManagerActivity>> {
  const token = getSessionToken();
  const headers: Record<string, string> = {};
  if (token) headers["X-Session-Token"] = token;
  const res = await fetch("/api/manager/activity", { headers });
  if (!res.ok) throw new Error(`GET /api/manager/activity failed: ${res.status}`);
  return res.json();
}

export async function saveAgentConfig(payload: AgentConfigPayload): Promise<void> {
  const { status, data } = await postJson<{ ok?: boolean; error?: string }>(
    "/api/agents/config",
    payload,
  );
  if (status === 404) {
    throw new Error(
      "POST /api/agents/config is not implemented yet (Phase 5.3: add-agents-config-write). The UI is ready but the server write endpoint has not landed.",
    );
  }
  if (status >= 400) throw new Error(data.error ?? `HTTP ${status}`);
}

/** Toggle the top-level parallelExecution flag in agents.yaml. Landed by
 *  add-parallel-execution-config. */
export async function setParallelExecution(value: boolean): Promise<void> {
  const { status, data } = await postJson<{ ok?: boolean; error?: string }>(
    "/api/config/parallel-execution",
    { value },
  );
  if (status >= 400) throw new Error(data.error ?? `HTTP ${status}`);
}

/** Toggle top-level tmux flag in agents.yaml. */
export async function setTmux(value: boolean): Promise<void> {
  const { status, data } = await postJson<{ ok?: boolean; error?: string }>(
    "/api/config/tmux",
    { value },
  );
  if (status >= 400) throw new Error(data.error ?? `HTTP ${status}`);
}

/** Enable/disable + upsert/remove the top-level `agmsg:` block in
 *  agents.yaml. Landed by add-agmsg-config-write. */
export async function setAgmsgConfig(
  payload:
    | { enabled: true; team: string; storage?: string }
    | { enabled: false },
): Promise<void> {
  const { status, data } = await postJson<{ ok?: boolean; error?: string }>(
    "/api/config/agmsg",
    payload,
  );
  if (status >= 400) throw new Error(data.error ?? `HTTP ${status}`);
}

// ---- doctor endpoint (add-doctor-and-installer) ----------------------------
// Note: the canonical fetcher is `fetchDoctorReport` below (session-token
// gated). `fetchDoctor` is retained as a thin alias so existing callers
// (InitDialog etc.) keep working after the doctor branch merged its real
// impl. Prefer `fetchDoctorReport` for new code.
export async function fetchDoctor(): Promise<DoctorReport> {
  return fetchDoctorReport();
}

// add-init-http-endpoint: POST /api/init client. Scaffolds a new project at
// an absolute path. autoCreateDir + autoGitInit default to true here because
// the UI's "New Project" flow expects one-shot creation.
//
// Extended by expand-init-to-scaffold-agents: accepts optional manager field
// (chosen CLI) and returns managerCommand in the result.
export interface InitProjectPayload {
  dir: string;
  force?: boolean;
  skipGitignore?: boolean;
  autoCreateDir?: boolean;
  autoGitInit?: boolean;
  manager?: { command: Cli };
  defaultManager?: Cli;
  /**
   * When true, skip runInit and only run the doctor gate + writeAgentsYaml.
   * Used by OnboardingProject's follow-up POST after the SSE chain has
   * already scaffolded openspec/ — avoids re-running openspec init --force.
   * (expand-init-to-scaffold-agents rework r2, F2 fix)
   */
  agentsYamlOnly?: boolean;
}
export interface InitProjectResult {
  ok: boolean;
  exitCode?: number;
  reason?: string;
  target?: string;
  actions?: Array<{ path: string; action: "create" | "skip" | "overwrite" }>;
  gitignoreResult?: string;
  summary?: { created: number; overwritten: number; skipped: number };
  openspecMissing?: boolean;
  gitInitPerformed?: boolean;
  /** Chosen Manager CLI (expand-init-to-scaffold-agents). */
  managerCommand?: Cli;
}
export async function initProject(
  payload: InitProjectPayload,
): Promise<InitProjectResult> {
  const { status, data } = await postJson<InitProjectResult>("/api/init", {
    autoCreateDir: true,
    autoGitInit: true,
    ...payload,
  });
  if (status >= 400 && !data.reason) {
    throw new Error(`HTTP ${status}`);
  }
  return data;
}

export async function fetchAgentJobs(): Promise<{ jobs: JobSummary[] }> {
  const res = await fetch("/api/agents/jobs");
  if (!res.ok) throw new Error(`GET /api/agents/jobs failed: ${res.status}`);
  return res.json();
}

export async function fetchAgentJob(id: string): Promise<Job | null> {
  const res = await fetch(`/api/agents/jobs/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /api/agents/jobs/${id} failed: ${res.status}`);
  return res.json();
}

export async function fetchAgentJobDiff(id: string): Promise<DiffPayload | null> {
  const res = await fetch(`/api/agents/jobs/${encodeURIComponent(id)}/diff`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /api/agents/jobs/${id}/diff failed: ${res.status}`);
  return res.json();
}

export async function runAgent(changeId: string, agentName: string): Promise<JobSummary> {
  const { status, data } = await postJson<JobSummary & { error?: string }>(
    "/api/agents/run",
    { changeId, agentName },
  );
  if (status >= 400) throw new Error(data.error ?? `HTTP ${status}`);
  return data;
}

// ---- git identity ----------------------------------------------------------
export async function fetchGitStatus(): Promise<GitStatus> {
  const res = await fetch("/api/git/status");
  if (!res.ok) throw new Error(`GET /api/git/status failed: ${res.status}`);
  return res.json();
}

export async function fetchGitConfig(): Promise<GitConfig> {
  const res = await fetch("/api/git/config");
  if (!res.ok) throw new Error(`GET /api/git/config failed: ${res.status}`);
  return res.json();
}

export async function postGitConfig(body: GitIdentity): Promise<GitStatus> {
  const { status, data } = await postJson<{ ok?: boolean; gitStatus?: GitStatus; error?: string }>(
    "/api/git/config",
    body,
  );
  if (status >= 400 || !data.gitStatus) throw new Error(data.error ?? `HTTP ${status}`);
  return data.gitStatus;
}

export async function postGitInit(): Promise<GitStatus> {
  const { status, data } = await postJson<{ ok?: boolean; gitStatus?: GitStatus; error?: string }>(
    "/api/git/init",
    {},
  );
  if (status >= 400 || !data.gitStatus) throw new Error(data.error ?? `HTTP ${status}`);
  return data.gitStatus;
}

// ---- Doctor API (add-doctor-and-installer) ---------------------------------

// Cli / CliStatus / DoctorReport live in ./types (single source of truth).
// Re-export here for callers that import from ./api.
export type { Cli, CliStatus, DoctorReport } from "./types";

/** Fetch the current prerequisite report (session-token gated). */
export async function fetchDoctorReport(): Promise<DoctorReport> {
  const token = getSessionToken();
  const headers: Record<string, string> = {};
  if (token) headers["X-Session-Token"] = token;
  const res = await fetch("/api/doctor", { headers });
  if (!res.ok) throw new Error(`GET /api/doctor failed: ${res.status}`);
  return res.json();
}

/**
 * POST /api/doctor/install to install tmux or agmsg.
 * Returns a ReadableStream of SSE text, or throws on 400.
 */
export async function installPrereq(
  tool: "tmux" | "agmsg",
): Promise<Response> {
  const res = await fetch("/api/doctor/install", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ tool }),
  });
  return res;
}

export async function cancelAgentJob(id: string): Promise<void> {
  // No body, but still uses the auth header. `postJson` adds Content-Type
  // application/json which a body-less POST tolerates fine.
  const { status, data } = await postJson<{ ok?: boolean; error?: string }>(
    `/api/agents/jobs/${encodeURIComponent(id)}/cancel`,
    {},
  );
  if (status >= 400) throw new Error(data.error ?? `HTTP ${status}`);
}

export type InjectResponse =
  | { status: "ok"; activeTerminals: number }
  | { status: "no-terminal"; reason: string }
  | { error: string };

/** Inject text into the most recently active embedded terminal (localhost only). */
export async function injectPty(data: string, terminate = true): Promise<InjectResponse> {
  // VS Code webview: the extension host owns the terminal, so post a message
  // instead of hitting our HTTP endpoint (there is no embedded terminal to
  // target inside the webview).
  if (isVsCodeShell()) {
    postToVsCode({ type: "pty.inject", data, terminate });
    return { status: "ok", activeTerminals: 1 };
  }
  const { data: body } = await postJson<InjectResponse>("/api/pty/inject", { data, terminate });
  return body;
}
