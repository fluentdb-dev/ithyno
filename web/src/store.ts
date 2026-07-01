import { create } from "zustand";
import {
  fetchState,
  fetchDocs,
  fetchDocFile,
  fetchTagIndex,
  fetchAgentConfig,
  fetchAgentJobs,
  fetchGitConfig,
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
  OutputLine,
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

type Store = {
  state: WorkspaceState | null;
  connected: boolean;
  loading: boolean;
  error: string | null;
  toasts: Toast[];
  conflicts: Record<string, Conflict>; // keyed by taskKey
  terminalAvailable: boolean;
  terminalVisible: boolean;
  commandStyle: CommandStyle;
  overviewLayout: OverviewLayout;
  docs: DocsTree | null;
  openDoc: DocsFile | null;
  tagIndex: TagIndex | null;
  tagIndexStale: boolean;
  agents: AgentPublic[];
  agentConfigError: string | null;
  jobs: Record<string, JobSummary>;
  jobOutputs: Record<string, OutputLine[]>;
  gitConfig: GitConfig | null;

  load: () => Promise<void>;
  connectWs: () => void;
  toggle: (task: Task) => Promise<void>;
  dismissConflict: (key: string) => void;
  pushToast: (kind: Toast["kind"], message: string) => void;
  dismissToast: (id: number) => void;
  setTerminalVisible: (v: boolean) => void;
  setCommandStyle: (v: CommandStyle) => void;
  setOverviewLayout: (v: OverviewLayout) => void;
  loadDocs: () => Promise<void>;
  openDocPath: (path: string | null) => Promise<void>;
  loadTagIndex: () => Promise<void>;
  loadAgents: () => Promise<void>;
  loadJobs: () => Promise<void>;
  appendJobOutput: (jobId: string, line: OutputLine) => void;
  upsertJob: (job: JobSummary) => void;
  setJobFinished: (jobId: string, status: JobStatus, exitCode: number | null) => void;
  loadGitConfig: () => Promise<void>;
  setGitStatus: (gitStatus: WorkspaceState["gitStatus"]) => void;
};

let toastSeq = 1;

// User preferences persisted to localStorage. Read once at module load so the
// initial render already reflects the saved choice (no flash of default state).
const TERM_KEY = "openspec-ui.terminalVisible";
function readTerminalVisible(): boolean {
  try {
    const v = localStorage.getItem(TERM_KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

const STYLE_KEY = "openspec-ui.commandStyle";
function readCommandStyle(): CommandStyle {
  try {
    const v = localStorage.getItem(STYLE_KEY);
    return v === "cli" ? "cli" : "claude";
  } catch {
    return "claude";
  }
}

const OVERVIEW_LAYOUT_KEY = "openspec-ui.overviewLayout";
function readOverviewLayout(): OverviewLayout {
  try {
    const v = localStorage.getItem(OVERVIEW_LAYOUT_KEY);
    return v === "cards" ? "cards" : "board";
  } catch {
    return "board";
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
  commandStyle: readCommandStyle(),
  overviewLayout: readOverviewLayout(),
  docs: null,
  openDoc: null,
  tagIndex: null,
  tagIndexStale: false,
  agents: [],
  agentConfigError: null,
  jobs: {},
  jobOutputs: {},
  gitConfig: null,

  loadAgents: async () => {
    try {
      const cfg = await fetchAgentConfig();
      set({ agents: cfg.agents, agentConfigError: cfg.ok ? null : cfg.error ?? "config error" });
    } catch (err) {
      set({ agentConfigError: err instanceof Error ? err.message : String(err) });
    }
  },
  loadJobs: async () => {
    try {
      const r = await fetchAgentJobs();
      const jobs: Record<string, JobSummary> = {};
      for (const j of r.jobs) jobs[j.id] = j;
      set({ jobs });
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
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const token = getSessionToken();
    const ws = new WebSocket(
      `${proto}://${location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ""}`,
    );
    ws.onopen = () => set({ connected: true });
    ws.onclose = () => {
      set({ connected: false });
      setTimeout(() => get().connectWs(), 1500);
    };
    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      const cur = get().state;
      if (!cur) return;
      if (msg.type === "change-updated") {
        set({ state: replaceChange(cur, msg.change) });
      } else if (msg.type === "spec-updated") {
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
      } else if (msg.type === "agent-job-output") {
        get().appendJobOutput(msg.jobId, { stream: msg.stream, chunk: msg.chunk, ts: Date.now() });
      } else if (msg.type === "agent-job-finished") {
        get().setJobFinished(msg.jobId, msg.status, msg.exitCode);
      } else if (msg.type === "git-status-updated") {
        const s = get().state;
        if (s) set({ state: { ...s, gitStatus: msg.gitStatus } });
        if (msg.gitStatus.isRepo) void get().loadGitConfig();
        else set({ gitConfig: null });
      }
    };
  },

  toggle: async (task) => {
    const cur = get().state;
    if (!cur) return;
    const change = cur.changes.find((c) => c.id && c.tasks?.filePath === task.filePath);
    const baseHash = change?.tasks?.baseHash ?? "";
    const desired = !task.checked;
    const key = taskKey(task);

    // Optimistic update: flip the checkbox immediately and clear any stale conflict.
    set((s) => {
      if (!s.state) return {};
      const next = mutateTask(s.state, task, (t) => ({ ...t, checked: desired }));
      const conflicts = { ...s.conflicts };
      delete conflicts[key];
      return { state: next, conflicts };
    });

    const res = await apiToggle({
      filePath: task.filePath,
      line: task.line,
      expectedText: task.raw,
      baseHash,
      desiredChecked: desired,
    });

    const live = get().state;
    if (!live) return;

    if (res.status === "ok" && res.change) {
      // Authoritative refresh (fresh baseHash + line numbers).
      set({ state: replaceChange(live, res.change) });
    } else if (res.status === "conflict" && res.change) {
      // Background reconciliation: adopt the authoritative change (rolls back
      // the optimistic flip), then flag THIS task for local re-confirmation.
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
    } else {
      if (res.change) set({ state: replaceChange(live, res.change) });
      get().pushToast("error", res.reason ?? "Update failed.");
    }
  },
}));

function mutateTask(state: WorkspaceState, target: Task, fn: (t: Task) => Task): WorkspaceState {
  return {
    ...state,
    changes: state.changes.map((c) => {
      if (c.tasks?.filePath !== target.filePath) return c;
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
    }),
  };
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
