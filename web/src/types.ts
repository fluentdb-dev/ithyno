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
  command: string;
  args: string[];
  hasEnv: boolean;
  initialInput?: string;
};

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
};

export type OutputLine = { stream: "stdout" | "stderr" | "stdin"; chunk: string; ts: number };
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
