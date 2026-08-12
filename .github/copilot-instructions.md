# GitHub Copilot Instructions

This file is loaded automatically by the GitHub Copilot CLI (`copilot`)
when it starts in this repo. It documents the contract for
**Copilot-invoked workers** in ithyno's dispatcher (`/ithy-opsx:dispatch`).

For the CLI-agnostic version (Antigravity, other agent runners), see
[`AGENTS.md`](../AGENTS.md) at the repo root. This file duplicates
the same content in the vendor-specific location Copilot reads.

## Project shape

This is **ithyno** — a spec-driven change dashboard built on OpenSpec.
Changes live under `openspec/changes/<change-id>/`:

- `proposal.md` — Why + What Changes + Impact
- `tasks.md` — checkbox list; the source of truth for progress
- `specs/<capability>/spec.md` — ADDED / MODIFIED / REMOVED requirement
  deltas
- `review.md` — written by review / verify workers (see below)
- `outcome.md` — written after impl, before archive
- `.openspec.yaml` — sidecar metadata

The dispatcher advances a change through
`proposed → coded → reviewed → done`.

## Skill namespace

Two prefixes:

- `/opsx:` — **pure OpenSpec** commands (work anywhere, no worktree /
  agents.yaml / ithyno API dependency).
- `/ithy-opsx:` — **ithyno-tied** commands (worktree convention,
  agents.yaml, `POST /api/changes/:id/phase`).

Workers are invoked with these prompts by the dispatcher:

- `code` role → `/opsx:apply <change-id>`
- `review` role → `/ithy-opsx:review <change-id>`
- `verify` role → `/ithy-opsx:verify <change-id>`

## Role contracts

Each Copilot invocation plays exactly ONE role per run. The role is
implicit from which template the dispatcher passed you — you can also
look at the argument list: if the dispatcher pipes review findings
after the change id, you are the code worker.

### `code` role

You are the implementer. Given a change id:

1. `cd` is already set to `.worktrees/<change-id>/` (an isolated
   git worktree on branch `agent/<change-id>`) when `parallelExecution:
   true` in `agents.yaml`. In main-tree mode, cwd is the project
   root. Verify with `pwd`. **Do NOT modify files outside the current
   tree**; specifically, do NOT edit `main` when in a worktree.
2. Read `openspec/changes/<change-id>/{proposal,tasks,specs/**}.md`
   for scope.
3. Implement each unchecked task in `tasks.md`. Tick the checkbox
   (`- [ ]` → `- [x]`) as you finish each.
4. Commit on the current branch:
   ```bash
   git add -A
   git commit -m "agent: implement <change-id>

   <one-line summary of changes>"
   ```
5. Do NOT push. Do NOT touch `main` (in worktree mode). Do NOT run
   `git merge`.

If the review worker passed prior findings appended to your prompt,
address every finding before moving on.

### `review` role

You are the reviewer. Given a change id:

1. Read `openspec/changes/<change-id>/{proposal,tasks,specs/**}.md`
   for the intended scope.
2. Inspect the diff:
   ```bash
   git diff --stat HEAD~1
   git diff HEAD~1
   ```
3. Judge against the rubric:
   - **`pass`**: diff realizes proposal's "What Changes" completely,
     no blockers (bugs / spec violations / security concerns /
     backward-incompat surprises).
   - **`needs-rework`**: any blocker OR missing "What Changes" scope.
4. Write `review.md` to the exact absolute path in the dispatcher's
   artifact contract. In worktree mode this is under the resolved
   worktree; in main-tree mode it is under the project root. For a direct
   invocation without an artifact contract, write relative to the current
   execution tree at `openspec/changes/<change-id>/review.md`:

   ```markdown
   ---
   verdict: pass | needs-rework
   summary: "One-line summary."
   findings:
     - severity: high | medium | low
       file: path/to/file.ext  # optional
       line: 42                # optional, positive int
       message: "Actionable description of the concern."
   ---

   ## Notes

   (Optional prose for human readers.)
   ```

   `verdict` MUST be exactly `pass` or `needs-rework`.
   `findings` MUST be an array (empty `[]` OK).
   Each finding needs `severity` and non-empty `message`.

5. Do NOT modify source files. Reviews are advisory. Only write
   `review.md`.

### `verify` role

You are the verifier — runs *after* review passes. Given a change id:

1. Run the project's test suite:
   ```bash
   npm run typecheck && npm test && npm run build
   ```
2. Write the same `review.md` shape as the `review` role. Verdict:
   - `pass`: all commands exit 0, no test failures.
   - `needs-rework`: any command failed. Include the failing
     command's summary in `findings` as `severity: high`.

## Success contract (dispatcher reads this)

The dispatcher reads your success signal from the artifact file, NOT
from your stdout:

- **`review.md` present with parseable `verdict:` frontmatter** →
  the dispatcher routes on the verdict.
- **`review.md` missing or unparseable** → the dispatcher escalates
  with `<stage> returned no artifact`.
- **Subprocess exit code non-zero** → the dispatcher escalates with
  `<stage> subprocess failed`.

Do NOT emit the verdict on stdout expecting the caller to pick it up
— **write it to the file**. Copilot returns exit code 0 even on
semantic failure, so exit code alone is not a sufficient signal.

## Common failure modes to avoid

- **Committing on `main`** (worktree mode): fatal.
- **Ignoring the absolute artifact contract**: the dispatcher reads only
  the exact path supplied to the worker. Do not redirect a worktree
  review to the main tree or a main-tree review to a worktree.
- **Modifying `tasks.md` from the review or verify role**: those
  roles are read-only WRT the change source.
- **Silent semantic failure**: exit code 0 without producing a
  `review.md`. The dispatcher will escalate.
