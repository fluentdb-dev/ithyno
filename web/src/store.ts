// SPDX-License-Identifier: GPL-3.0-or-later
import { create } from "zustand";
import {
  fetchState,
  fetchDocs,
  fetchDocFile,
  fetchTagIndex,
  fetchAgentConfig,
  fetchAgentJobs,
  fetchManagerStatus,
  fetchGitConfig,
  fetchGitStatus,
  checkAuth,
  triggerAuthExpired,
  toggleTask as apiToggle,
} from "./api";
import { getSessionToken } from "./runtime";
import type {
  AgentPublic,
  Change,
  DocsFile,
  DocsTree,
  GitConfig,
  JobStatus,
  JobSummary,
  ManagerStatus,
  OutputLine,
  Progress,
  SpecDomain,
  TagIndex,
  Task,
  WorkspaceState,
} from "./types";

export function taskKey(t: Pick<Task, "filePath" | "id" | "text">): string {
  return `${t.filePath}::${t.id || t.text}`;
}

type Toast = { id: number; kind: "info" | "error"; message: string };

type Conflict = { newText: string; message: string };

export type CommandStyle = "claude" | "cli";
export type OverviewLayout = "board" | "cards";
/** User preference for palette. `"system"` follows OS
 *  `prefers-color-scheme`; `"light"` / `"dark"` are hard overrides that
 *  ignore the OS. See `web/src/hooks/useAppliedTheme.ts` for the
 *  resolver that turns this into an actually-applied `"light" | "dark"`
 *  value on `<html data-theme=…>`. Landed by add-light-dark-mode. */
export type ThemePreference = "system" | "light" | "dark";

type Store = {
  state: WorkspaceState | null;
  connected: boolean;
  loading: boolean;
  error: string | null;
  toasts: Toast[];
  conflicts: Record<string, Conflict>; // keyed by taskKey
  terminalAvailable: boolean;
  terminalVisible: boolean;
  /** Bumped by `restartTerminal()` to trigger a React remount of `<Terminal>`.
   *  Consumer: `<Terminal key={terminalRestartCounter} />` in App.tsx. */
  terminalRestartCounter: number;
  commandStyle: CommandStyle;
  overviewLayout: OverviewLayout;
  /** Tri-state theme preference (see `ThemePreference`). Persisted to
   *  `localStorage["ithyno.theme"]`; hydrated at module load so the
   *  first render already matches the FOUC-guard's inline resolution. */
  theme: ThemePreference;
  docs: DocsTree | null;
  openDoc: DocsFile | null;
  tagIndex: TagIndex | null;
  tagIndexStale: boolean;
  agents: AgentPublic[];
  agentConfigError: string | null;
  /** Top-level parallelExecution flag from agents.yaml. Drives Start
   *  flow's mode selection (worktree if true, terminal inject if false).
   *  Landed by add-parallel-execution-config. */
  parallelExecution: boolean;
  /** Top-level `agmsg` block from agents.yaml, or null when absent
   *  (default). Landed by add-agmsg-config-block. Metadata-only in P1;
   *  consumers surface it only for future features. */
  agmsg: import("./types").AgmsgConfig | null;
  /** Resolved Manager status — declared entry, running fallback, or
   *  idle (no terminal, no declaration). Null before the first fetch.
   *  Landed by add-agents-tab-manager-section. */
  managerStatus: ManagerStatus | null;
  managerStatusError: string | null;
  jobs: Record<string, JobSummary>;
  jobOutputs: Record<string, OutputLine[]>;
  /** Per-change live progress derived from the running job's worktree
   *  tasks.md. Preferred over `change.progress` while a job is active or
   *  awaiting merge/discard. Cleared on merge/discard. */
  worktreeProgress: Record<string, Progress>;
  /** Per-change worktree Change snapshots pushed via `worktree-change-updated`
   *  (e.g. when the user ticks a verify item on the worktree view). Consumed
   *  by ChangeDetail's worktree view to keep tick state fresh across clients. */
  worktreeChangeById: Record<string, Change>;
  gitConfig: GitConfig | null;

  load: () => Promise<void>;
  connectWs: () => void;
  toggle: (task: Task) => Promise<void>;
  dismissConflict: (key: string) => void;
  pushToast: (kind: Toast["kind"], message: string) => void;
  dismissToast: (id: number) => void;
  setTerminalVisible: (v: boolean) => void;
  restartTerminal: () => void;
  setCommandStyle: (v: CommandStyle) => void;
  setOverviewLayout: (v: OverviewLayout) => void;
  setTheme: (v: ThemePreference) => void;
  loadDocs: () => Promise<void>;
  openDocPath: (path: string | null) => Promise<void>;
  loadTagIndex: () => Promise<void>;
  loadAgents: () => Promise<void>;
  loadManagerStatus: () => Promise<void>;
  loadJobs: () => Promise<void>;
  appendJobOutput: (jobId: string, line: OutputLine) => void;
  upsertJob: (job: JobSummary) => void;
  setJobFinished: (jobId: string, status: JobStatus, exitCode: number | null) => void;
  loadGitConfig: () => Promise<void>;
  setGitStatus: (gitStatus: WorkspaceState["gitStatus"]) => void;
  refreshGitStatus: () => Promise<void>;
  clearWorktreeProgress: (changeId: string) => void;
};

let toastSeq = 1;

/**
 * Module-level tracker for the current WebSocket. There is one live WS per
 * app lifetime; connectWs is idempotent — a second call while a socket is
 * still open is a no-op. This matters for React 19 StrictMode's
 * double-invocation of the mounting effect in dev.
 */
let currentWs: WebSocket | null = null;

// User preferences persisted to localStorage. Read once at module load so the
// initial render already reflects the saved choice (no flash of default state).
const TERM_KEY = "ithyno.terminalVisible";
function readTerminalVisible(): boolean {
  try {
    const v = localStorage.getItem(TERM_KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

const STYLE_KEY = "ithyno.commandStyle";
function readCommandStyle(): CommandStyle {
  try {
    const v = localStorage.getItem(STYLE_KEY);
    return v === "cli" ? "cli" : "claude";
  } catch {
    return "claude";
  }
}

const OVERVIEW_LAYOUT_KEY = "ithyno.overviewLayout";
function readOverviewLayout(): OverviewLayout {
  try {
    const v = localStorage.getItem(OVERVIEW_LAYOUT_KEY);
    return v === "cards" ? "cards" : "board";
  } catch {
    return "board";
  }
}

/** Storage key MUST match the FOUC guard in web/index.html — the guard
 *  reads it before React mounts to pick the initial palette. Any rename
 *  breaks first-paint synchronization. */
const THEME_KEY = "ithyno.theme";
function readTheme(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
    return "system";
  } catch {
    return "system";
  }
}

function replaceChange(state: WorkspaceState, change: Change): WorkspaceState {
  return { ...state, changes: state.changes.map((c) => (c.id === change.id ? change : c)) };
}

function replaceSpec(state: WorkspaceState, domain: string, spec: SpecDomain): WorkspaceState {
  return { ...state, specs: state.specs.map((s) => (s.domain === domain ? spec : s)) };
}

export const useStore = create<Store>((set, get) => ({
  state: null,
  connected: false,
  loading: true,
  error: null,
  toasts: [],
  conflicts: {},
  terminalAvailable: false,
  terminalVisible: readTerminalVisible(),
  terminalRestartCounter: 0,
  commandStyle: readCommandStyle(),
  overviewLayout: readOverviewLayout(),
  theme: readTheme(),
  docs: null,
  openDoc: null,
  tagIndex: null,
  tagIndexStale: false,
  agents: [],
  agentConfigError: null,
  parallelExecution: false,
  agmsg: null,
  managerStatus: null,
  managerStatusError: null,
  jobs: {},
  jobOutputs: {},
  worktreeProgress: {},
  worktreeChangeById: {},
  gitConfig: null,

  loadAgents: async () => {
    try {
      const cfg = await fetchAgentConfig();
      set({
        agents: cfg.agents,
        parallelExecution: cfg.parallelExecution,
        agmsg: cfg.agmsg,
        agentConfigError: cfg.ok ? null : cfg.error ?? "config error",
      });
    } catch (err) {
      set({ agentConfigError: err instanceof Error ? err.message : String(err) });
    }
  },
  loadManagerStatus: async () => {
    try {
      const managerStatus = await fetchManagerStatus();
      set({ managerStatus, managerStatusError: null });
    } catch (err) {
      set({ managerStatusError: err instanceof Error ? err.message : String(err) });
    }
  },
  loadJobs: async () => {
    try {
      const r = await fetchAgentJobs();
      const jobs: Record<string, JobSummary> = {};
      // Adopted / freshly-spawned jobs may already carry a
      // `worktreeProgress` snapshot — mirror it into the store slice so the
      // Kanban card renders the right number without waiting for a WS event.
      const wtProgress: Record<string, Progress> = {};
      for (const j of r.jobs) {
        jobs[j.id] = j;
        if (j.worktreeProgress) wtProgress[j.changeId] = j.worktreeProgress;
      }
      set((s) => ({ jobs, worktreeProgress: { ...s.worktreeProgress, ...wtProgress } }));
    } catch {
      /* swallow */
    }
  },
  appendJobOutput: (jobId, line) => {
    set((s) => {
      const prev = s.jobOutputs[jobId] ?? [];
      const next = prev.length > 10_000 ? [...prev.slice(prev.length - 10_000 + 1), line] : [...prev, line];
      return { jobOutputs: { ...s.jobOutputs, [jobId]: next } };
    });
  },
  upsertJob: (job) => set((s) => ({ jobs: { ...s.jobs, [job.id]: job } })),
  setJobFinished: (jobId, status, exitCode) =>
    set((s) => {
      const j = s.jobs[jobId];
      if (!j) return {};
      return {
        jobs: {
          ...s.jobs,
          [jobId]: { ...j, status, exitCode: exitCode ?? null, finishedAt: Date.now() },
        },
      };
    }),
  loadGitConfig: async () => {
    try {
      const cfg = await fetchGitConfig();
      set({ gitConfig: cfg });
    } catch {
      // Non-repo returns 409 and we already know via gitStatus; keep null.
      set({ gitConfig: null });
    }
  },
  setGitStatus: (gitStatus) => {
    const s = get().state;
    if (s) set({ state: { ...s, gitStatus } });
  },
  refreshGitStatus: async () => {
    try {
      const gitStatus = await fetchGitStatus();
      const s = get().state;
      if (s) set({ state: { ...s, gitStatus } });
    } catch {
      // Non-fatal: keep the last-known status if the fetch fails.
    }
  },
  clearWorktreeProgress: (changeId: string) => {
    set((s) => {
      if (!(changeId in s.worktreeProgress)) return {};
      const { [changeId]: _drop, ...rest } = s.worktreeProgress;
      return { worktreeProgress: rest };
    });
  },

  loadTagIndex: async () => {
    try {
      const idx = await fetchTagIndex();
      set({ tagIndex: idx, tagIndexStale: false });
    } catch (err) {
      console.error("loadTagIndex failed", err);
    }
  },

  loadDocs: async () => {
    try {
      const docs = await fetchDocs();
      set({ docs });
    } catch (err) {
      console.error("loadDocs failed", err);
    }
  },
  openDocPath: async (path) => {
    if (!path) {
      set({ openDoc: null });
      return;
    }
    const file = await fetchDocFile(path).catch(() => null);
    set({ openDoc: file });
  },

  setTerminalVisible: (v) => {
    try {
      localStorage.setItem(TERM_KEY, v ? "1" : "0");
    } catch {
      /* ignore quota / private-mode errors */
    }
    set({ terminalVisible: v });
  },
  restartTerminal: () => set((s) => ({ terminalRestartCounter: s.terminalRestartCounter + 1 })),
  setCommandStyle: (v) => {
    try {
      localStorage.setItem(STYLE_KEY, v);
    } catch {
      /* ignore */
    }
    set({ commandStyle: v });
  },
  setOverviewLayout: (v) => {
    try {
      localStorage.setItem(OVERVIEW_LAYOUT_KEY, v);
    } catch {
      /* ignore */
    }
    set({ overviewLayout: v });
  },
  setTheme: (v) => {
    try {
      localStorage.setItem(THEME_KEY, v);
    } catch {
      /* ignore quota / private-mode errors — theme reverts to default on reload */
    }
    set({ theme: v });
  },

  pushToast: (kind, message) => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(() => get().dismissToast(id), 5000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  dismissConflict: (key) =>
    set((s) => {
      const next = { ...s.conflicts };
      delete next[key];
      return { conflicts: next };
    }),

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [state, health] = await Promise.all([
        fetchState(),
        fetch("/api/health").then((r) => r.json()).catch(() => ({ terminal: { available: false } })),
      ]);
      set({
        state,
        loading: false,
        terminalAvailable: Boolean(health?.terminal?.available),
      });
      // Best-effort agents bootstrap.
      void get().loadAgents();
      void get().loadJobs();
      // Best-effort git-identity bootstrap so the chip is populated on load,
      // not only after opening the modal for the first time.
      if (state.gitStatus.isRepo) void get().loadGitConfig();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },

  connectWs: () => {
    // If a socket is already connecting or open, reuse it. This makes
    // connectWs idempotent under React 19 StrictMode's double-mount and
    // avoids the "two live sockets → every event duplicated" trap that
    // trying to close + reopen created (the close is async, so we ended
    // up with three or four sockets under bad timing).
    if (
      currentWs &&
      (currentWs.readyState === WebSocket.CONNECTING || currentWs.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const token = getSessionToken();
    const ws = new WebSocket(
      `${proto}://${location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ""}`,
    );
    currentWs = ws;
    let openedOnce = false;
    ws.onopen = () => {
      openedOnce = true;
      set({ connected: true });
    };
    ws.onclose = () => {
      if (currentWs === ws) currentWs = null;
      set({ connected: false });
      // If the socket was destroyed before it even opened, the server likely
      // rejected the CSRF/token gate — probably a stale token after a server
      // restart. Verify via /api/auth/check and surface the "session expired"
      // banner instead of retrying forever in the background.
      if (!openedOnce) {
        void checkAuth().then((ok) => {
          if (!ok) {
            console.warn("[ws] closed before open + auth check failed — session expired");
            triggerAuthExpired();
            return;
          }
          setTimeout(() => get().connectWs(), 1500);
        });
        return;
      }
      setTimeout(() => get().connectWs(), 1500);
    };
    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      // NOTE: Do NOT early-return when `state` is null. Several message
      // types (agents-updated, tags-updated, git-status-updated,
      // worktree-change-updated, doc-updated) do not depend on the
      // workspace state at all and MUST be processed even before the
      // first workspace load resolves. Only the handlers that mutate
      // `state` in place gate on its presence — inlined below.
      const cur = get().state;
      if (msg.type === "change-updated") {
        if (!cur) return;
        set({ state: replaceChange(cur, msg.change) });
      } else if (msg.type === "worktree-change-updated") {
        set((s) => ({ worktreeChangeById: { ...s.worktreeChangeById, [msg.changeId]: msg.change } }));
      } else if (msg.type === "spec-updated") {
        if (!cur) return;
        set({ state: replaceSpec(cur, msg.domain, msg.spec) });
      } else if (msg.type === "state-replaced") {
        void get().load();
      } else if (msg.type === "doc-updated") {
        // Refresh tree always; refresh open file only if it's the one that changed.
        if (msg.tree) set({ docs: msg.tree });
        const openPath = get().openDoc?.path;
        if (openPath && msg.path === openPath && msg.file) {
          set({ openDoc: msg.file });
        }
      } else if (msg.type === "tags-updated") {
        // Mark stale; if the user is on /tags, refetch immediately.
        if (location.pathname.startsWith("/tags")) {
          void get().loadTagIndex();
        } else {
          set({ tagIndexStale: true });
        }
      } else if (msg.type === "agent-job-started") {
        get().upsertJob(msg.job);
        // Drop any stale worktreeProgress for this change from a previous
        // run — the fresh watcher will re-populate it once tasks tick.
        set((s) => {
          if (!(msg.job.changeId in s.worktreeProgress)) return {};
          const { [msg.job.changeId]: _drop, ...rest } = s.worktreeProgress;
          return { worktreeProgress: rest };
        });
      } else if (msg.type === "agent-job-output") {
        get().appendJobOutput(msg.jobId, { stream: msg.stream, chunk: msg.chunk, ts: Date.now() });
      } else if (msg.type === "agent-job-finished") {
        get().setJobFinished(msg.jobId, msg.status, msg.exitCode);
      } else if (msg.type === "agent-job-removed") {
        // add-worktree-external-discard-detection: a terminal-driven
        // `git worktree remove` unlinked the watched tasks.md → server
        // dropped the job → drop it from the client too so the Kanban
        // card falls back to TODO instead of showing a ghost job.
        set((s) => {
          const jobs = { ...s.jobs };
          delete jobs[msg.jobId];
          const jobOutputs = { ...s.jobOutputs };
          delete jobOutputs[msg.jobId];
          const worktreeProgress = { ...s.worktreeProgress };
          delete worktreeProgress[msg.changeId];
          return { jobs, jobOutputs, worktreeProgress };
        });
      } else if (msg.type === "worktree-progress-updated") {
        set((s) => ({
          worktreeProgress: { ...s.worktreeProgress, [msg.changeId]: msg.progress },
        }));
      } else if (msg.type === "git-status-updated") {
        const s = get().state;
        if (s) set({ state: { ...s, gitStatus: msg.gitStatus } });
        if (msg.gitStatus.isRepo) void get().loadGitConfig();
        else set({ gitConfig: null });
      } else if (msg.type === "agents-updated") {
        // add-agents-broadcast-on-file-event — server fires this when
        // agents.yaml changes on disk (external edit OR Modal Save's
        // fs.watch follow-up). Payload IS the fresh state — no
        // separate GET needed for `agents`.
        set({
          agents: msg.agents,
          parallelExecution: msg.parallelExecution,
          agmsg: msg.agmsg,
          agentConfigError: msg.ok ? null : msg.error ?? "config error",
        });
        // Manager section is driven by `managerStatus` (a separate
        // /api/manager/status endpoint that resolves the PTY startup
        // chain). agents.yaml edits change whether a `role: manager`
        // entry is declared and its command/args — the Manager section
        // must reflect that too. Fire-and-forget refetch.
        void get().loadManagerStatus();
      }
    };
  },

  toggle: async (task) => {
    const cur = get().state;
    if (!cur) return;
    // Worktree tick: `<root>/.worktrees/<worktreeId>/openspec/changes/<id>/…`
    // The main state doesn't hold the worktree Change; look it up (and update
    // it) in `worktreeChangeById` instead.
    const worktreeMatch = task.filePath.match(/\.worktrees\/[^/]+\/openspec\/changes\/([^/]+)\//);
    const worktreeChangeId = worktreeMatch ? worktreeMatch[1] : null;
    const mainChange = cur.changes.find((c) => c.id && c.tasks?.filePath === task.filePath);
    const wtChange = worktreeChangeId ? get().worktreeChangeById[worktreeChangeId] : undefined;
    const baseHash = (worktreeChangeId ? wtChange?.tasks?.baseHash : mainChange?.tasks?.baseHash) ?? "";
    const desired = !task.checked;
    const key = taskKey(task);

    // Optimistic update: flip the checkbox immediately and clear any stale conflict.
    set((s) => {
      const conflicts = { ...s.conflicts };
      delete conflicts[key];
      if (worktreeChangeId) {
        const cur = s.worktreeChangeById[worktreeChangeId];
        if (!cur) return { conflicts };
        const flipped = mutateChangeTask(cur, task, (t) => ({ ...t, checked: desired }));
        return {
          worktreeChangeById: { ...s.worktreeChangeById, [worktreeChangeId]: flipped },
          conflicts,
        };
      }
      if (!s.state) return { conflicts };
      return { state: mutateTask(s.state, task, (t) => ({ ...t, checked: desired })), conflicts };
    });

    const res = await apiToggle({
      filePath: task.filePath,
      line: task.line,
      expectedText: task.raw,
      baseHash,
      desiredChecked: desired,
    });

    if (res.status === "ok" && res.change) {
      // Authoritative refresh (fresh baseHash + line numbers).
      if (worktreeChangeId) {
        set((s) => ({ worktreeChangeById: { ...s.worktreeChangeById, [worktreeChangeId]: res.change! } }));
      } else {
        const live = get().state;
        if (live) set({ state: replaceChange(live, res.change) });
      }
    } else if (res.status === "conflict" && res.change) {
      // Background reconciliation: adopt authoritative change; flag task for
      // local re-confirmation.
      if (worktreeChangeId) {
        set((s) => ({ worktreeChangeById: { ...s.worktreeChangeById, [worktreeChangeId]: res.change! } }));
      } else {
        const live = get().state;
        if (!live) return;
        const reconciled = replaceChange(live, res.change);
        const refreshed = findTask(reconciled, task);
        set((s) => ({
          state: reconciled,
          conflicts: refreshed
            ? {
                ...s.conflicts,
                [taskKey(refreshed)]: {
                  newText: refreshed.raw,
                  message: res.reason ?? "This task was updated externally.",
                },
              }
            : s.conflicts,
        }));
      }
    } else {
      if (res.change) {
        if (worktreeChangeId) {
          set((s) => ({ worktreeChangeById: { ...s.worktreeChangeById, [worktreeChangeId]: res.change! } }));
        } else {
          const live = get().state;
          if (live) set({ state: replaceChange(live, res.change) });
        }
      }
      get().pushToast("error", res.reason ?? "Update failed.");
    }
  },
}));

function mutateTask(state: WorkspaceState, target: Task, fn: (t: Task) => Task): WorkspaceState {
  return {
    ...state,
    changes: state.changes.map((c) => (c.tasks?.filePath === target.filePath ? mutateChangeTask(c, target, fn) : c)),
  };
}

function mutateChangeTask(c: Change, target: Task, fn: (t: Task) => Task): Change {
  if (!c.tasks) return c;
  const tasks = c.tasks;
  let done = 0;
  let total = 0;
  const sections = tasks.sections.map((sec) => ({
    ...sec,
    tasks: sec.tasks.map((t) => {
      const updated = taskKey(t) === taskKey(target) ? fn(t) : t;
      total++;
      if (updated.checked) done++;
      return updated;
    }),
  }));
  return { ...c, tasks: { ...tasks, sections }, progress: { done, total } };
}

function findTask(state: WorkspaceState, target: Task): Task | null {
  for (const c of state.changes) {
    if (c.tasks?.filePath !== target.filePath) continue;
    for (const sec of c.tasks.sections) {
      for (const t of sec.tasks) {
        if (taskKey(t) === taskKey(target)) return t;
      }
    }
  }
  return null;
}
