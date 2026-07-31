---
tags: [skills, port, cross-cli, dispatch, followup, ithy-opsx]
execution: worktree
---

## Why

`scaffold-ithy-opsx-skills-per-cli` (archived 2026-07-31) wired all
7 CLI renderers, but `ithyno/skills/` only contained the v1 pilot
`ithy-opsx-apply`. Every non-Claude Manager therefore gets exactly
one usable skill via renderer output.

**`ithy-opsx-dispatch` is the critical one** — it's what Kanban's
Start button injects into the Manager PTY. Without it, agy / codex /
etc Managers can't respond to Start no matter how correctly they're
scaffolded. The other skills (archive, merge, revert, answer, escalate,
review, verify, dispatch-multi, apply, import) are useful but not
gate-blocking for the basic "click Start, work happens" story.

This change ports just `ithy-opsx-dispatch` to universal source
(`ithyno/skills/ithy-opsx-dispatch/{SKILL.md, manifest.yaml}`). Content
is copied largely verbatim from `.claude/commands/ithy-opsx/dispatch.md`
(941 lines) — the dispatch protocol IS the CLI-agnostic contract,
already written portably in markdown. Only the manifest is new.

## What Changes

1. **New universal skill source** `ithyno/skills/ithy-opsx-dispatch/`:
   - `manifest.yaml` — namespace `ithy-opsx`, command `dispatch`,
     supports all 7 CLIs, capabilities `subagent_spawn` + `bash` +
     `file_write`, per-CLI overrides (claude category/tags matching
     the existing `.claude/commands/ithy-opsx/dispatch.md` frontmatter).
   - `SKILL.md` — dispatch protocol body copied from
     `.claude/commands/ithy-opsx/dispatch.md`. Existing per-CLI CLI-
     specific phrasing (Task tool, agmsg spawn, etc.) is retained
     verbatim rather than abstracted to capability tokens — polish for
     capability-token substitution can come later without breaking
     what's readable and working today.

2. **Renderer output validation** — smoke tests confirm every renderer
   emits the ported skill at its declared path, matching the pattern
   established for `ithy-opsx-apply`.

3. **`.claude/commands/ithy-opsx/dispatch.md` and
   `templates/.claude/commands/ithy-opsx/dispatch.md` retained as-is**
   for this change. Retirement of the templates copy is deferred
   (still gated on ALL skills being ported per the previous change's
   task 4 — this is the second skill port, not the last).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `cross-cli-skill-installer`: extend renderer coverage assertions to
  cover both `ithy-opsx-apply` and the newly-ported
  `ithy-opsx-dispatch`. No new requirements — this is expanding the
  count of skills the existing "openspec init invokes per-CLI
  renderers" requirement operates over.

## Impact

- `ithyno/skills/ithy-opsx-dispatch/` — new directory + 2 files
  (~950 lines of copied content + a small manifest)
- `server/skill-renderer.test.ts` — extend per-CLI e2e tests to
  assert `ithy-opsx-dispatch` also lands at each renderer's path
- No server, web, electron, or bin/* changes — the renderer + init
  wiring from the previous change already handle new sources
  automatically as they appear in `ithyno/skills/`
- test-proj2 (agy) users who re-run `openspec init` after this
  change will see `.antigravity/skills/ithy-opsx-dispatch/SKILL.md`
  materialize alongside the existing apply skill
