---
tags: [feature/agents, feature/messaging, area/skills, agmsg, dispatch-fix]
---

# Dispatcher tells the worker where to write review.md

## Why

Today's `verify-dispatch-e2e` run surfaced a real bug: Copilot's
`/opsx:review` skill wrote `review.md` to the **main tree**
(`openspec/changes/verify-dispatch-e2e/review.md`) instead of the
worktree (`.worktrees/verify-dispatch-e2e/openspec/changes/verify-
dispatch-e2e/review.md`), even though the worker was spawned inside
the worktree via `--project`.

Root cause is in the worker skill (`/opsx:review`) itself — it
resolves the change directory from repo-root rather than cwd. But
the dispatcher can avoid depending on that fix by **passing the
exact target path in the boot-prompt** and telling the worker to
write there.

This change closes the gap at the dispatcher layer:

- In worktree mode, boot-prompt appends: "Write your `review.md`
  to `<absolute worktree path>/openspec/changes/<change-id>/
  review.md`."
- In main-tree mode (no worktree), the path is the main tree —
  same as today's effective behavior.

Once worker skills are fixed to honor cwd (separate follow-up), the
explicit-path instruction becomes belt-and-suspenders; either way
review.md lands where the dispatcher expects it.

## What Changes

### 1. Dispatch skill — boot-prompt appends target path

Update `.claude/commands/ithy-opsx/dispatch.md`. The agmsg branch's
resolved boot-prompt SHALL gain an explicit "write to path"
instruction when the stage is `review` or `verify`:

```
--- artifact contract ---
Write your review.md to this exact absolute path:
  <TARGET_PATH>/openspec/changes/<change-id>/review.md
Do NOT rely on your CLI's cwd inference; the dispatcher will look
at this exact path only.
```

Where `<TARGET_PATH>` is:
- `.worktrees/<change-id>/` (absolute) when running in worktree
  mode.
- Manager's project root (absolute) when running in main-tree
  mode.

This section is appended before the existing "report contract"
section so the artifact write happens before the completion
signal.

### 2. Manager already reads review.md from that same path

The Manager's post-report artifact judgment (per
`signal-stage-completion-via-agmsg-message`) reads
`openspec/changes/<change-id>/review.md` — that's a repo-relative
path evaluated from Manager's cwd (main tree). In worktree mode,
that's the wrong location (Manager can't see the worktree's
review.md from its cwd).

Fix the Manager side too: read from the same absolute
`<TARGET_PATH>` used in the boot-prompt.

### 3. What this change does NOT touch

- **No worker-skill fix**. `/opsx:review` (Claude / Copilot / etc.)
  keeps its cwd-inference behavior; explicit-path instruction in
  the boot-prompt sidesteps the bug at dispatch time.
- **No archive-flow change**. `openspec archive <id>` continues to
  scan main-tree paths at merge time; the worktree's review.md is
  merged in as part of the impl commit.
- **No change to the code stage**. Code stage completion is
  message + git-log (per `signal-stage-completion-via-agmsg-message`);
  no artifact path involved.
- **No change to Task tool / subprocess branches**. Those workers
  run in the correct cwd via the runner's `child.cwd = worktree`
  and honor it, so review.md lands correctly today.

## Spec deltas (`dashboard` capability)

- **MODIFIED** `Dispatch Slash Command` — the agmsg branch's
  boot-prompt gains the artifact contract; Manager's artifact
  judgment reads from the same absolute path.

## Impact

- **Affected specs**: `dashboard` — 1 MODIFIED
- **Affected files**:
  - `.claude/commands/ithy-opsx/dispatch.md` (boot-prompt + read
    path)
  - `openspec/specs/dashboard/spec.md` (PENDING annotation + delta
    application at archive)
- **Risk**:
  - Worker CLI that refuses to follow explicit-path instructions
    would still write to its cwd default. Mitigation: dispatcher's
    check is authoritative — if the review.md is not at the
    instructed path, escalate `<stage> did not write review.md at
    <expected path>`.
  - Absolute path exposes the local filesystem layout in the
    boot-prompt — a mild information leak on shared / logged
    contexts. Mitigation: the same path is already in `--project`;
    no new leakage.
- **Migration**: none. Change is additive and works whether the
  worker CLI honors the instruction or not.
