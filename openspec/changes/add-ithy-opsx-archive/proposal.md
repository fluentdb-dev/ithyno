---
tags: [feature/archive, feature/git, area/skills, area/web]
---

## Why

In the OpenSpec workflow, **archive is the semantic boundary** where a
change stops being "in flight" and becomes part of history: files move
from `openspec/changes/<id>/` to `openspec/changes/archive/`, delta
specs get folded into `openspec/specs/<capability>/`, and the change
turns from a plan into a chapter. It is exactly where git commits
should also happen — one archive, one commit — so the repo's history
lines up with the workflow's history.

Today the dashboard's Archive button injects `/opsx:archive <id>`
(pure OpenSpec). The command moves the files, but **it does not
commit**. The user is left with a dirty working tree and has to run
`git commit` themselves. Worse, when the change was implemented in an
agent worktree, the worktree branch also has to be merged first —
another manual step. Three imperative gestures for one semantic
boundary.

The natural fix is not to build server-side merge + archive + commit
plumbing (that reinvents `openspec archive` and `git`, and hides the
steps from the user). It is to **define the flow in a Claude skill**
and expose it as one slash command:

    /ithy-opsx:archive <id>

Claude follows the skill: preflight, optional worktree merge, archive,
commit with an auto-generated message the user can approve. The
dashboard just injects the command. The skill is text — editable by the
user, versioned in the repo, portable across CLIs that speak
Markdown-first workflows.

This change also promotes the **`/ithy-opsx:` namespace** from the
`docs/ideas/2026-07-01-merge-workflow-and-namespace.md` idea file — this
is the first concrete command in that namespace. Future `/ithy-opsx:merge`
and friends will follow the same shape.

## What Changes

- **New slash command** `.claude/commands/ithy-opsx/archive.md` — a
  minimal entry that instructs Claude to follow the skill.
- **New skill** `.claude/skills/ithy-opsx-archive/SKILL.md` with the
  step-by-step body:
  1. Preflight: change directory exists; unchecked non-verify tasks
     surface a warning; `outcome.md` presence check with a prompt to
     write one if missing.
  2. Worktree merge (if `.worktrees/<id>/` and `agent/<id>` exist):
     `git merge --no-ff agent/<id>` into the current branch; pause on
     conflict for user resolution.
  3. Archive: run `openspec archive <id>` (delegates to the OpenSpec
     CLI, which is the source of truth for the file layout).
  4. Commit: `git add .` then a `git commit` with an auto-generated
     message that the user reviews:
     ```
     archive: <change-id>

     <one-line summary from proposal.md's Why section>

     Tags: <tags from proposal frontmatter>
     ```
  5. Cleanup (optional, ask user): `git worktree remove` + `git branch -D`
     for the agent branch if it was merged in step 2.
  6. Report: link to the new archive path and the commit hash.
- **Dashboard rewire**: the Kanban Archive button + ChangeDetail's
  archive action inject `/ithy-opsx:archive <id>` instead of
  `/opsx:archive <id>` when `commandStyle === "claude"`. The CLI mode
  path (`npx openspec archive <id>`) is unchanged — plain OpenSpec CLI
  users still get plain archive.
- **Idea file promotion**: `docs/ideas/2026-07-01-merge-workflow-and-namespace.md`
  frontmatter flips `status: promoted`, `promoted_to:
  openspec/changes/add-ithy-opsx-archive/proposal.md`. The idea's
  content stays as historical record.

## Capabilities

### New Capabilities
<!-- none — the skill body lives in `.claude/`; the dashboard rewire is
     a wiring change against existing capabilities -->

### Modified Capabilities
- `dashboard`: Claude-style archive now injects `/ithy-opsx:archive`,
  which runs the merge + archive + commit sequence via the skill

## Impact

- New skill file `.claude/skills/ithy-opsx-archive/SKILL.md`
- New command file `.claude/commands/ithy-opsx/archive.md`
- `web/src/pages/ChangeDetail.tsx`: `build` function's archive branch
  emits `/ithy-opsx:archive` when `mode === "claude"` (unchanged for
  `mode === "cli"`)
- `web/src/components/Kanban.tsx`: same substitution in the archive
  branch of `buildPendingCommand`
- `docs/ideas/2026-07-01-merge-workflow-and-namespace.md`: frontmatter
  update to promoted status
- `docs/architecture/parallel-shells.md`: one paragraph noting the
  archive path

## Out of scope

- **Server-side archive endpoint**. Deliberately not built — the skill
  covers the flow, and keeping it in Markdown lets users edit / audit
  the steps without touching TypeScript.
- **Push to remote**. If a project wants push-on-archive, that's a
  separate skill step or a follow-up change; keep v1 local-only.
- **Merge-conflict resolution UI**. The skill pauses; user resolves in
  their editor / terminal; re-runs `/ithy-opsx:archive`.
- **`/opsx:archive` deprecation**. The upstream command still works
  (CLI mode still uses `npx openspec archive`). We only add an
  ithy-flavored superset for the Claude path.
- **`/ithy-opsx:merge`, `/ithy-opsx:reject`**. Same idea file lists
  them — separate proposals when we get to them.
