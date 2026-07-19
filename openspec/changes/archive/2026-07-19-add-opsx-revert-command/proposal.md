---
tags: [tooling, workflow, slash-command, area/skills]
---

# Add `/opsx:revert` slash command

## Why

`revert-kanban-ui-lanes` (2026-07-12) surfaced that the Revert workflow
has 4 hand-typed steps that are easy to miss:

1. `openspec new change revert-<scope>` + hand-write `proposal.md`,
   `specs/<capability>/spec.md`, `tasks.md`.
2. Insert `> ⚠️ **PENDING REMOVAL** by [<change-id>](...)` at the head
   of every target requirement in the current
   `openspec/specs/<capability>/spec.md`.
3. For Case α, insert `> **REVERTED** by [<change-id>](...)` at the
   head of each archived target's `proposal.md`.
4. Classify Case α / β and cite each target in `proposal.md`'s Why.

Steps 2 and 3 are the ones I recently missed on `revert-active-phase-ui`
— we didn't catch that other agents / sessions could read the current
spec and follow a doomed requirement without seeing the pending revert.
The convention is now documented in `CLAUDE.md` and the openspec-flow
skill (added by `revert-kanban-ui-lanes`), but a hard rule is only as
good as its enforcement.

A `/opsx:revert <scope>` slash command bakes the checklist into
tooling. Any future revert lands with the annotations in place,
regardless of who runs it.

## What Changes

1. **`.claude/commands/opsx/revert.md`** — user-facing slash command.
   Accepts `<scope>` (or asks interactively) and delegates the
   workflow to the skill.

2. **`.claude/skills/opsx-revert/SKILL.md`** — the workflow recipe.
   Steps: gather targets → classify Case α/β → run `openspec new
   change` → generate `proposal.md` (with Why + Targets sections
   pre-filled) → generate delta `specs/<capability>/spec.md` (with
   REMOVED / MODIFIED headers) → insert PENDING annotations into
   current specs → insert REVERTED annotations into Case α archive
   proposals → run `openspec validate`.

3. **`openspec/specs/dashboard/spec.md`** — one ADDED requirement
   documenting the command's contract, so a future review can
   verify it against the spec (same pattern
   `add-worker-skills` used for its 4 slash commands).

## Impact

- **Files added**: 2 (command + skill), plus 1 ADDED spec requirement.
- **Existing changes**: none touched.
- **Blast radius**: purely additive. If the command doesn't exist,
  the manual workflow still works — nothing depends on it.
- **Follow-up**: once landed, the next revert (whenever) uses
  `/opsx:revert <scope>` instead of hand-typed steps.

## Out of scope

- **Automating `openspec archive` inside the command** — the revert's
  archive step is already a separate `/ithy-opsx:archive <id>`
  invocation; overlapping the two commands would be confusing.
- **Detecting reverts automatically from proposals** — the command
  assumes the user is already at "I want to revert X". Prompt-based
  discovery ("is any recent change a revert candidate?") is a
  different tool.
- **UI-integrated launch** — no dashboard button yet. The command
  is invoked from the embedded terminal only.
