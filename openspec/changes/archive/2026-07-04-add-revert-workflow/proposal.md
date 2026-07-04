---
tags: [feature/workflow, area/skills, area/docs]
---

## Why

We just shipped `revert-agent-pty-layers`, which reverted the code
introduced by three earlier changes (`add-agent-pty-runner`,
`add-agent-xterm-output`, `add-agent-stdin-relay`). Every step of
that revert was invented on the spot:

- The naming (`revert-<target>`) was ad-hoc.
- The spec-delta shape had to be rewritten mid-archive when we
  discovered the target changes' ADDED requirements never actually
  reached specs.
- The 3 reverted changes were left in `openspec/changes/` after
  the revert landed because there was no defined disposition —
  archive with a "reverted" outcome? Delete? Leave in-flight?
- Future readers see them as active work when their code is gone.

The lesson: **revert is a real workflow shape, not a scary
exception**. Big projects revert changes routinely; ithyno should
have a documented, repeatable playbook for it, not require each
future revert to reinvent the mechanics.

## What Changes

Codify revert as a first-class workflow variant. The rules are
small — most of what makes a revert unique is disposition of the
target(s) it reverted.

### Naming convention

- Revert change id: `revert-<scope>` where scope names the reverted
  behavior, not necessarily the target ids (e.g.
  `revert-agent-pty-layers` collapses three targets under one
  scope).
- Frontmatter `tags:` include `feature/revert`.
- Proposal's Why section MUST list the reverted changes by id and
  explain what's kept vs. what's dropped.

### Target disposition (two cases)

Every revert's proposal must classify its targets:

**Case α — Target was already archived when the revert lands**
- Spec deltas from the target reached
  `openspec/specs/<capability>/spec.md` at archive time.
- Revert change's own spec delta uses `MODIFIED` and/or `REMOVED`
  to unwind those requirements.
- Target archive stays put; the revert's outcome links back.

**Case β — Target was NOT archived when the revert lands**
- Spec deltas from the target never applied to specs.
- Revert change's spec delta uses `ADDED` only, describing the
  post-revert baseline directly.
- The still-in-flight target(s) MUST be archived alongside the
  revert (see "Reverted-target archive" below).

Every revert MUST identify which case each target falls under. A
single revert can have targets in both cases.

### Reverted-target archive (Case β specifically)

For each target that was in-flight when the revert lands:

1. Delete the target's `specs/` subdirectory (its ADDED deltas
   would collide with the revert's new baseline).
2. Write a "reverted" outcome:
   - Title: `# Outcome: <target-id> (reverted)`
   - Body preserves ✅ Worked / ⚠️ Surprises from the original
     implementation — history is honest about what was tried.
   - 🔁 Differently and 🌱 Follow-ups sections replaced with a
     single bold pointer to the reverting change id.
3. `openspec archive <target-id>` moves it into the archive tree.
4. Order: archive the targets BEFORE the reverting change (so the
   Kanban and the archive dir reflect the revert as the terminal
   state).

### Skill and docs

- `.claude/skills/openspec-flow/SKILL.md`: add a "Revert" section
  documenting the naming, disposition cases, and reverted-target
  archive steps.
- `CLAUDE.md` Standard order: cross-reference the Revert section
  in one line.
- `templates/.claude/skills/openspec-flow/SKILL.md`: mirror.
- `templates/CLAUDE.md`: mirror.

### Validation via first application

This change's implementation phase applies the workflow to the
three still-in-flight targets left over from `revert-agent-pty-
layers`: `add-agent-pty-runner`, `add-agent-xterm-output`, and
`add-agent-stdin-relay`. Their archives serve as the workflow's
first end-to-end run, and their `outcome.md` files exemplify the
Case β template.

## Capabilities

### Modified Capabilities

- `dashboard`: workflow doc change; no runtime behavior change.

## Impact

- `.claude/skills/openspec-flow/SKILL.md` + template copy
- `CLAUDE.md` + template copy
- New outcome files for the three reverted-and-still-in-flight
  targets (used both as documentation and as the workflow's
  live example)
- File moves for the three targets into
  `openspec/changes/archive/` via `openspec archive`

## Out of scope

- **`/ithy-opsx:revert` slash command** that automates the flow.
  Attractive but separate — this change codifies the human /
  agent-readable rules first; automation follows once the rules
  have some mileage.
- **Historical retrofit**: rewriting past archive dirs to conform.
  History is history; the workflow applies forward from this
  change.
- **Enforcement tooling** (a git hook or spec validator that
  rejects a revert proposal missing the Case-α/β classification).
  Social discipline for now; automate later.
- **Renaming `openspec-flow` to `ithy-flow`.** That's the sister
  change `add-impl-commit-and-rename-flow-skill`; will land
  independently, and either change is willing to accept the
  other's naming.
