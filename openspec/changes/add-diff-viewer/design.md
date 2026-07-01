## Context

The Tier-1 gap for the parallel-worktree experience is closing the loop:
after an agent finishes, the user needs to see the diff inside the
dashboard, not in a separate terminal. `add-agent-runner` already exposes
enough state (job → branch → worktreePath) to extract the diff; what's
missing is the extraction itself and the rendering.

Two simplifications keep this change small:

1. **Read-only**. Editing is out of scope. Approval goes through the
   existing Merge flow.
2. **Shell out to `git diff`**. The parent repository can see every
   worktree's commits since they share `.git`. We do not need to chdir
   into the worktree to read its branch; `git -C <repo> diff <merge-base>
   <branch>` works from the main worktree.

## Goals / Non-Goals

**Goals:**
- Per-job structured diff endpoint.
- File-tree navigation when many files changed.
- Per-file unified hunks rendered with insertion / deletion colors.
- Entry from the job detail and from the kanban card.

**Non-Goals:**
- Inline comments / review threads on diffs.
- Side-by-side rendering (unified only in v1; side-by-side is a future
  refinement).
- Syntax highlighting in hunks (uses monospace + diff color only).
- Image / binary diffs (we show "binary file changed" placeholders).
- Diff between arbitrary refs. v1 is only "the agent's branch vs its
  merge-base with main."

## Decisions

### Server: shell out to `git diff`

```ts
git -C <projectRoot> diff --unified=3 --no-color <mergeBase>..<branch>
```

`mergeBase` is computed once per request via `git merge-base main
<branch>`. The branch name comes from the job record (`agent/<id>`).

Output is parsed with a hand-rolled parser over `--unified=3` text. We
emit a structured shape:

```ts
type DiffPayload = {
  jobId: string;
  branch: string;
  base: string;            // merge-base SHA
  files: DiffFile[];
};
type DiffFile = {
  oldPath: string | null;  // null when added
  newPath: string | null;  // null when deleted
  kind: "added" | "modified" | "deleted" | "renamed";
  isBinary: boolean;
  hunks: DiffHunk[];
  stats: { insertions: number; deletions: number };
};
type DiffHunk = {
  oldStart: number; oldLines: number;
  newStart: number; newLines: number;
  header: string;          // "@@ ... @@" line
  lines: DiffLine[];
};
type DiffLine = { kind: "ctx" | "add" | "del"; text: string };
```

A hand-rolled parser keeps us free of `diff`-package dependencies and the
output is small enough that we don't need a streaming response.

### Caching

A per-job lazy cache: the first request runs `git diff` and stores the
result; subsequent requests return the cache. The cache is invalidated
when the job's terminal state changes (e.g. a cancel that came in late).
We do NOT invalidate on every WS event — recomputing diffs is cheap but
not free.

### UI: components

- `DiffView` — top-level component that takes a `jobId`, fetches the
  payload, renders file tree + selected file
- `FileTree` — sorted by path, with stats badges (e.g. `+12 / -3`)
- `FileDiff` — header (path + kind) + hunks
- `HunkLines` — three colors: context (text), addition (green), deletion
  (red). Line numbers in the gutter (old + new)

### UI entry points

- **`/agents` job detail** gains a tab strip: "Output" (existing) and
  "Diff" (new). Defaults to Output for running jobs, Diff for finished
  ones.
- **Kanban card** with a finished latest job gains a "View diff" action
  alongside the existing Merge / Discard. Clicking navigates to
  `/agents/<jobId>?tab=diff` (or however the route shape lands; could
  also use a modal — see below).

### Modal vs page

For v1, the diff lives on the Agents page (route-based). A modal preview
on hover/click of the kanban card is appealing but adds layout
complications (the kanban card is already busy). Page-based keeps focus
on review.

### Stats summary

The kanban card shows compact stats `+12 −3 · 4 files` next to the
"View diff" button so the user gets an at-a-glance scale.

## Risks / Trade-offs

- **Performance for huge diffs.** A pathological change (huge generated
  files, thousand-file refactor) could produce a payload of multiple
  megabytes. v1 hard-caps the rendered hunks at 5000 lines per file with
  a "truncated, view full diff in terminal" footer.
- **Renamed files.** `git diff` only emits a rename when `--find-renames`
  is enabled; we set it, but renames with no similarity threshold are
  rendered as add+delete pairs. Acceptable for v1.
- **Binary files.** We surface as "binary file changed" rows with stats
  blank. No rendering.
- **The diff goes stale if the user runs the agent again.** Cache
  invalidates on job state transitions; if the user re-runs without
  state changing (rare), the cache is fine because the same branch HEAD
  produces the same diff.
- **Hand-rolled parser bugs.** Mitigation: unit tests for the parser
  including edge cases (empty diff, file with no newline at end of file,
  renames, binary).
