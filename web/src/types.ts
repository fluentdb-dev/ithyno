// SPDX-License-Identifier: GPL-3.0-or-later
// Client-side mirror of the server domain model (server/model.ts).

export type WorkspaceState = {
  root: string;
  exists: boolean;
  specs: SpecDomain[];
  changes: Change[];
  archive: ChangeSummary[];
  gitStatus: GitStatus;
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

// ---- agent-runner ----------------------------------------------------------
export type AgentPublic = {
  name: string;
  description?: string;
  /** Legacy shape (command + args). Present on legacy agents; absent on
   *  runtime-backed agents (add-runtime-abstraction). */
  command?: string;
  args?: string[];
  hasEnv: boolean;
  initialInput?: string;
  /** Runtime-backed shape (runtime + prompt). Present on
   *  runtime-backed agents; absent on legacy. */
  runtime?: string;
  prompt?: string;
  /** Phase 1 (add-agent-role-field) metadata. */
  role: string;
  specialties: string[];
  concurrency: number;
  dedicated: boolean;
};

// ---- Runtime detection (add-runtime-detection Phase 3.3) -------------------
export type RuntimePromptStyle = "cli-arg" | "stdin" | "file";
export type RuntimeDiffStrategy = "git" | "aider-native" | "none";
export type RuntimeSupports = {
  interactive: boolean;
  artifactOutput: boolean;
  diff: RuntimeDiffStrategy;
};

/** Server-side RuntimeDef mirror — see server/agents/registry.ts. */
export type RuntimeDefPublic = {
  name: string;
  command: string;
  baseArgs: string[];
  promptStyle: RuntimePromptStyle;
  promptFlag?: string;
  supports: RuntimeSupports;
  installed: boolean;
  path?: string;
  error?: string;
};

export type RuntimeStatusResponse = {
  runtimes: RuntimeDefPublic[];
};

/** Write shape sent by AgentConfigModal to `POST /api/agents/config`.
 *  Phase 5.2 defines the client mirror; Phase 5.3 lands the endpoint.
 *  Delete is expressed as `{ action: "delete", name }` for a compact
 *  API surface — the write endpoint dispatches on `action`. */
export type AgentConfigPayload =
  | {
      action: "upsert";
      /** Kebab-case; when editing an existing agent this must match
       *  the row being edited. When adding, this must not already
       *  exist server-side. */
      name: string;
      role: string;
      /** Legacy shape. `command` is required for legacy; `args` may
       *  be empty. */
      command?: string;
      args?: string[];
      /** Runtime-backed shape. Mutually exclusive with `command`. */
      runtime?: string;
      prompt?: string;
      specialties: string[];
      concurrency: number;
      dedicated: boolean;
      description?: string;
    }
  | { action: "delete"; name: string };

export type AgentConfigResponse = {
  ok: boolean;
  error?: string;
  agents: AgentPublic[];
};

export type JobStatus = "running" | "completed" | "cancelled" | "crashed" | "orphaned";

export type JobSummary = {
  id: string;
  changeId: string;
  agentName: string;
  branch: string;
  worktreePath: string;
  status: JobStatus;
  startedAt: number;
  finishedAt?: number;
  exitCode?: number | null;
  worktreeProgress?: Progress;
  // extend-agent-job-model: server sets these three at spawn / finish.
  // Client mirror of server/agents/runner.ts's JobSummary — hand-synced.
  role: string;
  runtime: string;
  artifactPaths?: string[];
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

// Toggle endpoint response.
export type ToggleResponse = {
  status: "ok" | "conflict" | "invalid";
  reason?: string;
  newHash?: string;
  editedLine?: number;
  newLineText?: string;
  change: Change | null;
};
