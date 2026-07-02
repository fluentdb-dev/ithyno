---
tags: [feature/agent-runner, feature/git, area/skills]
---

## Why

`add-ithy-opsx-archive` landed with a **safety-net commit step** in
its skill: if the agent's worktree had uncommitted work at archive
time, the skill would commit it on the agent branch before merging.
That safety net exists because agents don't commit by default —
`/opsx:apply` (upstream) makes file edits, ticks task checkboxes, and
stops. Whether the worktree ends "clean" depends entirely on whether
the agent (or the user, or a hook) remembered to commit.

The safety net works, but it puts the "when was this actually
implemented?" moment on the archive skill's shoulders. We can do
better: **have the agent commit its own work as part of the apply
flow**, so by the time archive runs, the branch already has a proper
implementation commit and the archive step just adds its own commit
on top. Cleaner history, cleaner archive skill, no ambiguity.

The right lever is another ithy-opsx-family skill: **`/ithy-opsx:apply`**.
It wraps `/opsx:apply` — reuses the upstream implementation skill —
and adds a **"commit before you stop"** step at the end. Same shape as
`/ithy-opsx:archive` wraps `/opsx:archive`. The `agents.yaml` default
agent switches from `/opsx:apply` to `/ithy-opsx:apply`, and every
worktree agent starts ending with a real commit on its branch.

The archive skill's safety-net step 2 (`Commit the agent's uncommitted
work`) stays as-is for defense-in-depth: if a project team uses a
different agent that doesn't commit, or if the apply skill was
interrupted, archive still catches it.

## What Changes

- **New slash command** `.claude/commands/ithy-opsx/apply.md` — minimal
  entry that instructs Claude to follow the skill.
- **New skill** `.claude/skills/ithy-opsx-apply/SKILL.md`. Steps:
  1. Preflight (change exists, tasks.md exists).
  2. **Delegate to `/opsx:apply <id>`** — reuse the upstream apply
     workflow verbatim. This is where the code changes and task-check
     ticks happen.
  3. **Commit at the end**. Inspect `git status --porcelain`; if
     dirty, stage and commit on the current branch (which, when spawned
     from `agent-runner`, is `agent/<id>`) with a message shaped like:

     ```
     agent: implement <change-id>

     <one-line summary — bullet list of the top-level tasks.md sections
     that got completed, or a sentence from proposal.md's Why section
     as fallback>
     ```

  4. If the tree is already clean, skip the commit step (the agent
     already committed as it worked, or nothing changed).
  5. Report: commit hash + subject, or "clean tree, nothing to commit."
- **`agents.yaml.example`** — the bundled Claude entry's `initialInput`
  becomes `/ithy-opsx:apply ${change_id}` instead of `/opsx:apply
  ${change_id}`. Comment explains the swap.
- **`agents.yaml`** (this repo's working copy) — updated to match so
  dogfood runs the new path.
- **Archive skill safety net stays**. `.claude/skills/ithy-opsx-archive/SKILL.md`
  step 2 is unchanged — it catches non-Claude / interrupted flows.

## Capabilities

### New Capabilities
<!-- none — extends the agent-runner capability via a skill, not code -->

### Modified Capabilities
- `agent-runner`: the default `initialInput` for the Claude agent
  runs `/ithy-opsx:apply` instead of `/opsx:apply`, so worktree agents
  end with their implementation committed on the agent branch

## Impact

- `.claude/skills/ithy-opsx-apply/SKILL.md` — new
- `.claude/commands/ithy-opsx/apply.md` — new
- `agents.yaml.example` — one-line edit + a comment about the flag
- `agents.yaml` (repo's own) — one-line edit to match
- `docs/architecture/parallel-shells.md` — one paragraph noting that
  the Claude default now commits at end-of-apply
- No server code changes. No client code changes.

## Out of scope

- **Modifying `/opsx:apply` itself**. Upstream OpenSpec's decision.
- **Enforcing commit at the runner level** (e.g. a git-hook-style
  wrapper that server-side runs after every agent). The skill layer is
  the right place; the runner stays generic.
- **Custom commit-message conventions per project**. v1 uses one
  template; a follow-up can add per-agents.yaml overrides if needed.
- **Handling merge conflicts inside apply**. Apply doesn't merge; that's
  the archive skill's territory.
- **Non-Claude agents (Aider, Codex)**. They have their own commit
  conventions. Users who register Aider agents in `agents.yaml`
  configure the agent-specific flag themselves; the safety-net in the
  archive skill catches any that don't.
