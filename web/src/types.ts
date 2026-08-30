// SPDX-License-Identifier: GPL-3.0-or-later
// Client-side mirror of the server domain model (server/model.ts).

export type WorkspaceState = {
  root: string;
  exists: boolean;
  specs: SpecDomain[];
  changes: Change[];
  archive: ChangeSummary[];
  gitStatus: GitStatus;
  /** True when CLAUDE.md exists at the project root. Landed by
   *  unify-open-project-3-branch — surfaces the hint in
   *  <NoProjectDecisionPanel />. Non-breaking additive field. */
  hasClaudeMd: boolean;
  /** `.worktrees/.lock` state — null when no lock is held. Consumed by
   *  the Start button to gate when `parallelExecution: false` and the
   *  lock is held by a different change. Landed by
   *  collapse-jobregistry-and-add-semaphore. */
  lock: WorktreeLock | null;
  /** Whether `agents.yaml` exists as a readable file at the project root.
   *  False when absent, a directory, or unreadable. The dashboard uses
   *  this to render a hint when auto-launch is suppressed.
   *  Landed by guard-terminal-autolaunch-on-agents-yaml. */
  hasAgentsYaml: boolean;
  /** True when `openspec/GENERATED.md` exists at the project root. The
   *  dashboard uses this to render the LLM-generated banner after import.
   *  Also used by ImportProgress to detect import completion via the
   *  workspace file-watch WS broadcast. Non-breaking additive field.
   *  Landed by refactor-import-to-task-tool-subagent. */
  generatedMarkerPresent: boolean;
};

export type WorktreeLock = {
  change: string;
  acquiredAt: string;
  pid: number | null;
};

export type GitStatus =
  | { isRepo: true; root: string; headBranch: string | null; hasCommits: boolean }
  | { isRepo: false; reason?: "git-missing" };

export type GitIdentity = {
  userName?: string;
  userEmail?: string;
};

export type GitConfig = {
  effective: GitIdentity;
  local: GitIdentity;
};

export type Change = {
  id: string;
  proposal: ProposalDoc | null;
  design: RawDoc | null;
  tasks: TaskList | null;
  deltaSpecs: SpecDomain[];
  progress: Progress;
  hasOutcome: boolean;
  /** Workflow phase persisted in `.openspec.yaml`. Undefined = unphased
   *  (Kanban renders in the legacy fallback section). `needs-human` is a
   *  valid value but does not place the card in a dedicated lane; the
   *  card stays in its `priorPhase` lane with a WaitBadge. The client
   *  narrows unknown strings to undefined. */
  phase?: import("./phases").PersistedPhase;
  /** Restored when a `needs-human` escalation is answered. Also read by
   *  the Kanban to place the card in its home lane while escalated. */
  priorPhase?: import("./phases").PersistedPhase;
  /** ISO 8601 timestamp of the escalation. Rendered as a WaitBadge on
   *  the card while `phase === "needs-human"`. */
  escalatedAt?: string;
  /** Question surfaced from `needs-human.md` and shown on the Kanban
   *  card head while `phase === "needs-human"`. */
  needsHumanQuestion?: string;
  /** Populated when `.worktrees/<id>/` exists on disk. Presence drives
   *  Kanban's IN-PROGRESS placement (collapse-jobregistry-and-add-
   *  semaphore). `tasksProgress` reflects the worktree's own tasks.md,
   *  which typically differs from `progress` (the main tree copy). */
  worktree?: {
    path: string;
    branch: string;
    tasksProgress: Progress;
  };
};

export type ChangeSummary = {
  id: string;
  progress: Progress;
  archivedAt: string | null;
  outcome: { body: string } | null;
};
export type Progress = { done: number; total: number };

export type TaskList = {
  filePath: string;
  baseHash: string;
  sections: TaskSection[];
  parseError?: string;
  raw?: string;
};

export type TaskSection = { title: string; tasks: Task[] };

export type Task = {
  id: string;
  text: string;
  checked: boolean;
  line: number;
  raw: string;
  filePath: string;
};

export type ProposalDoc = {
  filePath: string;
  intent?: string;
  scope?: string;
  approach?: string;
  raw: string;
  tags: string[];
  execution?: "worktree" | "terminal";
};

export type RawDoc = { filePath: string; raw: string };

export type DeltaKind = "ADDED" | "MODIFIED" | "REMOVED" | null;

export type SpecDomain = {
  domain: string;
  filePath: string;
  purpose?: string;
  requirements: Requirement[];
  delta?: DeltaKind;
  parseError?: string;
  raw?: string;
};

export type Requirement = {
  name: string;
  text: string;
  scenarios: Scenario[];
  delta?: DeltaKind;
};

export type Scenario = { name: string; steps: string[] };

export type DocsTree = {
  root: string;
  exists: boolean;
  entries: DocsEntry[];
};

export type DocsEntry =
  | { kind: "dir"; name: string; path: string; children: DocsEntry[] }
  | { kind: "file"; name: string; path: string; frontmatter: Record<string, unknown> | null };

export type DocsFile = {
  path: string;
  frontmatter: Record<string, unknown> | null;
  body: string;
  hash: string;
};

// ---- tagging ---------------------------------------------------------------
export type ArtifactType = "idea" | "doc" | "change" | "spec" | "archive" | "outcome";

export type ArtifactEntry = {
  type: ArtifactType;
  path: string;
  title: string;
  hrefIn: string | null;
};

export type TagSummary = {
  tag: string;
  count: number;
  byType: Partial<Record<ArtifactType, number>>;
};

export type TagIndex = {
  byNamespace: Record<string, TagSummary[]>;
  namespaceOrder: string[];
};

export type TagDetail = {
  tag: string;
  artifacts: ArtifactEntry[];
};

// ---- about-panel -----------------------------------------------------------
export type SponsorLink = {
  label: string;
  url: string;
};

export type AboutInfo = {
  name: string;
  version: string;
  license: string;
  description: string;
  repositoryUrl: string;
  issuesUrl: string;
  releasesUrl: string;
  licenseUrl: string;
  sponsors: SponsorLink[];
};

// ---- agent-runner ----------------------------------------------------------
export type AgentMode = "single-prompt" | "live-shell";

export type AgentPublic = {
  name: string;
  description?: string;
  command?: string;
  args?: string[];
  hasEnv: boolean;
  /** Spawn mode. Required after loader normalization (reshape-agents-yaml-mode-roles). */
  mode: AgentMode;
  /** Dispatch labels. Always non-empty. Single-role legacy agents have
   *  `roles.length === 1`. */
  roles: string[];
  /** Per-role prompt overrides. When absent, built-in defaults kick in. */
  prompts?: Record<string, string>;

  // ---- deprecated read aliases (populated by the loader from the
  // normalized fields for downstream consumers that predate the reshape) ----
  /** Deprecated. Equals `roles[0]`. */
  role: string;
  /** Deprecated. Populated from `prompts[roles[0]]`. */
  initialInput?: string;
  /** Deprecated. Populated from `prompts[roles[0]]`. */
  prompt?: string;
};

/** Manager section source-of-truth (add-agents-tab-manager-section).
 *  Reflects the resolved PTY startup so the tab can be honest about
 *  what's actually running, even when no `role: manager` entry exists. */
export type ManagerStatus = {
  agentEntry: AgentPublic | null;
  resolvedStartup: string | null;
  initialInput: string | null;
  fallbackSource: "declared" | "env" | "default";
  terminalActive: boolean;
};

/** Write shape sent by AgentConfigModal to `POST /api/agents/config`.
 *  Post-reshape (reshape-agents-yaml-mode-roles): the payload speaks the
 *  new `mode + roles + prompts` schema. */
export type AgentConfigPayload =
  | {
      action: "upsert";
      /** Kebab-case; when editing an existing agent this must match
       *  the row being edited. When adding, this must not already
       *  exist server-side. */
      name: string;
      /** Dispatch labels. Non-empty. */
      roles: string[];
      /** Spawn mode. `single-prompt` for headless workers; `live-shell`
       *  for interactive Manager. Manager roles require `live-shell`. */
      mode: AgentMode;
      /** Per-role prompt overrides. Built-in defaults kick in for absent
       *  entries. */
      prompts?: Record<string, string>;
      command?: string;
      args?: string[];
      description?: string;
    }
  | { action: "delete"; name: string };

export type AgentConfigResponse = {
  ok: boolean;
  error?: string;
  agents: AgentPublic[];
  parallelExecution: boolean;
  /** Max concurrent worker spawns for `/ithy-opsx:dispatch-multi`
   *  (default 3, range [1, 10]). Landed by
   *  add-multi-dispatch-orchestrator. */
  maxParallel: number;
  /** Max code↔review rework iterations before escalation for
   *  `/ithy-opsx:dispatch` and `/ithy-opsx:dispatch-multi`
   *  (default 5, range [1, 10]). Landed by
   *  add-agents-max-rework-rounds-config. */
  maxReworkRounds: number;
  agmsg: AgmsgConfig | null;
  tmux: boolean;
};

/** Top-level `agmsg` block from agents.yaml, mirrored via
 *  `GET /api/agents/config` and the `agents-updated` WS event.
 *  Landed by add-agmsg-config-block. */
export type AgmsgConfig = {
  team: string;
  storage?: string;
};

export type JobStatus = "running" | "completed" | "cancelled" | "crashed" | "orphaned";

export type JobSummary = {
  id: string;
  changeId: string;
  agentName: string;
  branch: string;
  worktreePath: string;
  status: JobStatus;
  /** Dispatch role — set at spawn time by Manager (or the /api/agents/run
   *  caller). Standard values: "propose" | "code" | "review" | "verify".
   *  Custom / non-standard values are accepted but the Phase view filters
   *  them out of role-based bucketing. Undefined on legacy records from
   *  before reshape-phase-view-to-active-agent-state — Phase view treats
   *  those as "no role signal" and falls back to DONE lane. */
  role?: string;
  startedAt: number;
  finishedAt?: number;
  exitCode?: number | null;
  worktreeProgress?: Progress;
  /** add-review-artifact: parsed review.md verdict when the job
   *  produced one, otherwise undefined. */
  verdict?: import("./reviewTypes").ReviewArtifact;
};

export type OutputLine = { stream: "stdout" | "stderr"; chunk: string; ts: number };
export type Job = JobSummary & { output: OutputLine[] };

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

// ---- Manager activity (expose-manager-activity-per-change,
//      reshape-phase-view-to-active-agent-state renamed stage → role) ------

/** The workflow role the Manager is currently executing. Unified with
 *  `JobSummary.role` — Manager IS always playing one of these roles at any
 *  active moment (fallback verify = Manager playing verify role). Mirrors
 *  `server/manager-activity.ts` `ManagerRole`. */
export type ManagerRole = "propose" | "code" | "review" | "verify";

/** What the Manager is doing within that role. `idle` is never stored —
 *  posting it clears the entry — so a `ManagerActivity` in the store is
 *  always one of the five renderable values. */
export type ManagerActivityKind =
  | "dispatching"
  | "waiting"
  | "judging"
  | "cleanup"
  | "transitioning"
  | "idle";

/** Per-change Manager orchestration state. In-memory server-side: a server
 *  restart clears every entry (there is deliberately no persistence). */
export type ManagerActivity = {
  changeId: string;
  role: ManagerRole;
  activity: ManagerActivityKind;
  /** epoch ms — when this activity became current. Drives the elapsed suffix. */
  startedAt: number;
  /** Short hint: worker name for `waiting`, step name for `cleanup`, … */
  detail?: string;
};

/** Payload for the `manager-activity-updated` server WS event.
 *  `activity: null` means the entry was cleared. */
export type ManagerActivityUpdatedEvent = {
  type: "manager-activity-updated";
  changeId: string;
  activity: ManagerActivity | null;
};

// ---- import-completed WS event (enable-import-both-patterns) ---------------

/** Payload for the `import-completed` server WS event. */
export type ImportCompletedEvent = {
  type: "import-completed";
  jobId: string;
  targetPath: string;
  pattern: "A" | "B";
};

// Toggle endpoint response.
export type ToggleResponse = {
  status: "ok" | "conflict" | "invalid";
  reason?: string;
  newHash?: string;
  editedLine?: number;
  newLineText?: string;
  change: Change | null;
};

// ---- agent CLI identifiers (expand-init-to-scaffold-agents) ----------------
/** Union of known agent CLI identifiers. Mirrors server/doctor.ts Cli type
 *  and web/src/api.ts (kept in sync manually — small union, low churn). */
export type Cli =
  | "claude"
  | "codex"
  | "agy"
  | "copilot"
  | "gemini"
  | "opencode"
  | "cursor"
  | "antigravity";

/** Priority order for default Manager selection (highest priority first).
 *  `antigravity` is excluded from the priority list — the server's
 *  readyForManager gating also treats it as an "extra" not required for
 *  base ithyno operation. */
export const CLI_PRIORITY: Cli[] = [
  "claude",
  "codex",
  "agy",
  "copilot",
  "gemini",
  "opencode",
  "cursor",
];

/** Status of a single CLI as reported by /api/doctor. */
export type CliStatus = {
  installed: boolean;
  version?: string;
  path?: string;
  error?: string;
};

/** Response from GET /api/doctor (add-doctor-and-installer). */
export type DoctorReport = {
  agents: Record<Cli, CliStatus>;
  tmux: CliStatus;
  agmsg: CliStatus;
  /** Windows only — see server/doctor.ts's DoctorReport doc comment. */
  gitBash?: CliStatus;
  /** All platforms — see server/doctor.ts's DoctorReport doc comment. */
  git: CliStatus;
  node: CliStatus;
  /** macOS-only helper for clickable desktop notifications. */
  alerter?: CliStatus;
  readyForManager: boolean;
  checkedAt: string;
};

// ---- browse mode (unify-open-project-3-branch) -----------------------------

/** A node in the markdown-tree response from GET /api/browse/markdown-tree. */
export type MarkdownTreeNode = {
  path: string;
  name: string;
  kind: "file" | "dir";
  children?: MarkdownTreeNode[];
};

/** Response from GET /api/browse/markdown?path=<rel>. */
export type MarkdownContent = {
  path: string;
  content: string;
};
