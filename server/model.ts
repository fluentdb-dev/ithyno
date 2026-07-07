// SPDX-License-Identifier: GPL-3.0-or-later
// Normalized, read-only domain model parsed from the openspec/ directory.
// This model is never serialized back to Markdown wholesale — task edits are
// applied as surgical, line-level patches (see sync/surgicalEdit.ts).

export type WorkspaceState = {
  root: string; // absolute path to the openspec/ directory
  exists: boolean; // false when no openspec/ dir was found
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

/** Effective = what a commit made now would use (local > global > system chain).
 *  Local = what --local scope specifically has (may differ from or match effective). */
export type GitConfig = {
  effective: GitIdentity;
  local: GitIdentity;
};

export type Change = {
  id: string; // directory name == change-name
  proposal: ProposalDoc | null;
  design: RawDoc | null;
  tasks: TaskList | null;
  deltaSpecs: SpecDomain[];
  progress: Progress;
  /** True when an `outcome.md` file sits next to the change's other artifacts. */
  hasOutcome: boolean;
  /** Explicit workflow phase persisted in `.openspec.yaml`. Undefined =
   *  unphased (renders in the Kanban's legacy fallback section). Landed by
   *  add-phase-state-machine. `needs-human` is a valid value but never
   *  places a card in a dedicated lane — see the notes on `priorPhase`. */
  phase?: import("./phases.js").PersistedPhase;
  /** The phase to restore when a `needs-human` escalation is answered.
   *  Populated only while `phase === "needs-human"`. The Kanban also
   *  reads this to place the card in its "home" lane (falling back to
   *  `proposed` when missing). */
  priorPhase?: import("./phases.js").PersistedPhase;
  /** ISO 8601 timestamp of the escalation. Populated only while
   *  `phase === "needs-human"`. Kanban card renders it as a WaitBadge
   *  (`⏳ Nh` elapsed) in the head. */
  escalatedAt?: string;
  /** First-line H1 of `needs-human.md`, surfaced on the Kanban card as
   *  the escalation question. Populated only while
   *  `phase === "needs-human"` AND the artifact exists on disk. */
  needsHumanQuestion?: string;
};

export type ChangeSummary = {
  id: string;
  progress: Progress;
  /** YYYY-MM-DD parsed from the archive directory name; null when the directory name does not carry a date. */
  archivedAt: string | null;
  /** Body of `outcome.md` if the archive directory contains one; null otherwise. */
  outcome: { body: string } | null;
};

export type Progress = { done: number; total: number };

export type TaskList = {
  filePath: string; // absolute path to tasks.md
  baseHash: string; // sha1 of the file content when parsed
  sections: TaskSection[];
  parseError?: string;
  raw?: string; // present only when parseError is set (fallback display)
};

export type TaskSection = {
  title: string; // e.g. "1. Theme Infrastructure"
  tasks: Task[];
};

export type Task = {
  id: string; // hierarchical number e.g. "1.2" (best-effort, may be empty)
  text: string; // task body without the checkbox marker
  checked: boolean;
  line: number; // 0-based line number within tasks.md
  raw: string; // the exact original line text (used for expectedText matching)
  filePath: string;
};

export type ProposalDoc = {
  filePath: string;
  intent?: string;
  scope?: string;
  approach?: string;
  raw: string;
  tags: string[];
  /** Optional planning-time hint for how the change is implemented. Unset
   *  means "ask the user with an execution picker at start time." */
  execution?: "worktree" | "terminal";
};

export type RawDoc = {
  filePath: string;
  raw: string;
};

export type SpecDomain = {
  domain: string; // directory name under specs/
  filePath: string;
  purpose?: string;
  requirements: Requirement[];
  delta?: DeltaKind; // set for change delta specs
  parseError?: string;
  raw?: string;
};

export type DeltaKind = "ADDED" | "MODIFIED" | "REMOVED" | null;

export type Requirement = {
  name: string;
  text: string;
  scenarios: Scenario[];
  delta?: DeltaKind;
};

export type Scenario = {
  name: string;
  steps: string[]; // GIVEN / WHEN / THEN lines
};

// ---- design-docs ---------------------------------------------------------
export type DocsTree = {
  root: string; // absolute path to the docs/ directory
  exists: boolean;
  entries: DocsEntry[];
};

export type DocsEntry =
  | { kind: "dir"; name: string; path: string; children: DocsEntry[] }
  | {
      kind: "file";
      name: string;
      path: string; // path relative to docs/, no leading slash
      frontmatter: Record<string, unknown> | null;
    };

export type DocsFile = {
  path: string;
  frontmatter: Record<string, unknown> | null;
  body: string;
  hash: string;
};
