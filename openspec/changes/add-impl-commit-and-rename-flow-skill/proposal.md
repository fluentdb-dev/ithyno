---
tags: [feature/workflow, area/skills, area/docs]
---

## Why

Two related workflow gaps surfaced during a heavy dogfooding
session:

### 1. Long-lived dirty main tree between propose and archive

The current `Standard order` in `CLAUDE.md` treats **archive as the
only commit gesture** (per `add-ithy-opsx-archive`'s "one archive,
one commit" contract). That works when a single change is in flight
at a time, but during real dogfooding we accumulate several changes'
implementations in the main tree simultaneously — each one waiting
for its verify + archive step. The result is:

- 10+ files modified across 5+ changes, no clean boundary between
  them.
- Merges from agent branches into a dirty main create conflicts on
  shared files (`server/index.ts`, `Kanban.tsx`, `store.ts`) that
  didn't need to conflict — different changes just landed near each
  other.
- History reads as one giant "archive" commit for each change even
  when the impl was landed piecemeal over hours.

### 2. Misleading `openspec-flow` skill name

The project-local workflow skill lives at `.claude/skills/openspec-
flow/SKILL.md` (with a template copy for `ithyno init`). The
`openspec-*` prefix strongly suggests "installed by upstream OpenSpec
CLI", which is the naming convention for the actual upstream skills
(`openspec-propose`, `openspec-apply-change`,
`openspec-archive-change`, `openspec-explore`, `openspec-sync-specs`).
Editing it feels off-limits until you read the description carefully.

Renaming it to `ithy-flow` (matching the `ithy-opsx-*` family) makes
the ownership visible from the file path alone: `openspec-*` =
upstream, `ithy-*` = ours.

## What Changes

### 1. Introduce `impl:` commit step

Add a fourth commit type to the workflow between propose and archive:

```
propose: <id>     — proposal / spec delta committed (existing)
impl: <id>        — implementation committed (NEW)
archive: <id>     — file moves + outcome committed (existing)
```

Rules for the impl commit:

- Fires when the tasks under §1–§(last-verify-section) are done and
  the code type-checks / tests-pass on main. Verify tasks may still
  be unticked; that's fine — verify is what leads to archive.
- Subject line: `impl: <change-id>` (matches propose/archive
  cadence).
- Body: 1-3 sentence summary of what landed, optionally a list of
  the change ids in flight if multiple changes share files.
- When multiple in-flight changes touch the same file, one impl
  commit MAY carry more than one change id — subject line uses a
  compound form (`impl: <id-a> + <id-b>`) and the body lists both.
  The archive commits later stay individual per change.

The archive step still runs `openspec archive <id>` and produces its
own commit — that commit ONLY carries the file moves + outcome.md
addition + spec deltas, NOT the code impl (which is already in the
main tree as of the impl commit).

### 2. Rename `openspec-flow` → `ithy-flow`

- `.claude/skills/openspec-flow/` → `.claude/skills/ithy-flow/`
  (dogfooding copy)
- `templates/.claude/skills/openspec-flow/` →
  `templates/.claude/skills/ithy-flow/` (copied by `ithyno init`)
- Update in-file `name:` frontmatter accordingly.
- Update descriptions to be explicit: "ithyno's project-local
  workflow that composes with the upstream OpenSpec skills".
- Root `CLAUDE.md` and `templates/CLAUDE.md` update references from
  `openspec-flow` → `ithy-flow`.

### 3. Doc updates that formalize the impl commit

- Root `CLAUDE.md` + `templates/CLAUDE.md`: extend the Standard
  order block:

  ```
  1. /opsx:propose  (proposal + spec delta committed as propose:)
  2. openspec validate
  3. Implement, ticking tasks
  4. npm test + typecheck + build pass
  4a. Commit as impl: <id>   ← NEW
  5. Write outcome.md
  6. openspec archive  (file moves committed as archive:)
  ```
- `ithy-flow/SKILL.md` mirrors the same in prose form.
- `ithy-opsx-apply/SKILL.md`: notes the agent-branch case already
  commits at end (unchanged); adds a note that main-tree
  implementations follow the same `impl:` commit rule via the
  workflow.
- `ithy-opsx-archive/SKILL.md`: unchanged in behavior; add a note
  that on main tree the impl commit precedes archive so the archive
  commit is a clean file-moves-only diff.

## Capabilities

### Modified Capabilities

- `dashboard`: no runtime behavior change; workflow doc / skill
  contents update.

## Impact

- File moves: `openspec-flow` directory rename in both dogfooding
  and template locations
- Reference updates: root `CLAUDE.md`, `templates/CLAUDE.md`, the
  renamed skill's `name:` frontmatter, ithy-opsx-apply /
  ithy-opsx-archive skill notes
- New content: `impl:` commit description added to CLAUDE.md and
  the ithy-flow SKILL

## Out of scope

- **Rewriting existing history** to add retroactive impl commits.
  The rule applies going forward.
- **Enforcement tooling** (a git hook that rejects `archive:`
  commits containing code impl). Interesting future addition, but
  the rule is currently intended as social discipline, not
  automation.
- **Splitting archive into `archive:` + `spec-delta:` two commits.**
  Rejected — archive is meaningful as a semantic boundary; the
  file moves and spec deltas belong together.
- **Renaming other `openspec-*` skills** we might add later. If we
  add more project-local skills, they should use the `ithy-*`
  prefix from the start; renaming those that don't exist yet is a
  non-issue.
