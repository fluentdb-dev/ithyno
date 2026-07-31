# Tasks

## 1. Port dispatch to universal source

- [x] 1.1 Create `ithyno/skills/ithy-opsx-dispatch/manifest.yaml` — `name: ithy-opsx-dispatch`, `namespace: ithy-opsx`, `command: dispatch`, description matching the current `.claude/commands/ithy-opsx/dispatch.md` frontmatter, `supports:` all 7 CLIs (claude, codex, antigravity, cursor, gemini, copilot, opencode), `capabilities_required: [subagent_spawn, bash, file_write]`, `per_cli.claude: { upstream_command: /ithy-opsx:dispatch, category: Workflow, tags: [workflow, dispatch, manager, agmsg, phase-4] }`.
- [x] 1.2 Create `ithyno/skills/ithy-opsx-dispatch/SKILL.md` — copy body from `.claude/commands/ithy-opsx/dispatch.md` (~941 lines, everything below the frontmatter). Content verbatim — capability-token abstraction (converting Task-tool references to `<capability:subagent_spawn>` etc.) is deferred as separate polish, not gating for MVP dispatch discoverability.
- [x] 1.3 Verify the new source parses correctly with the schema: `npm test -- skill-renderer` should still pass. If schema rejects any field (description length, supports enum, etc.), adjust manifest and retry.

## 2. Renderer coverage assertions

- [x] 2.1 Extend `server/skill-renderer.test.ts`'s "installSkills per-CLI end-to-end" describe block to also assert `.antigravity/skills/ithy-opsx-dispatch/SKILL.md` (and equivalent per CLI) materializes when the pilot suite runs.
- [x] 2.2 Multi-skill selection assertion: when claude is selected, both `ithy-opsx-apply.md` AND `ithy-opsx-dispatch.md` (or their equivalents at claude's declared path) land.

## 3. Verification

- [x] 3.1 `npm run openspec -- validate port-ithy-opsx-dispatch-to-universal-source --strict` — passes.
- [x] 3.2 `npm run typecheck` — clean.
- [x] 3.3 `npm test` — all tests pass; new dispatch-skill assertions green.
- [ ] 3.4 Manual smoke (deferred to user): fresh init a test-proj with agy → confirm `.antigravity/skills/ithy-opsx-dispatch/SKILL.md` is present. Kanban Start on a fresh change → confirm agy Manager discovers the dispatch skill.

## 4. Docs

- [x] 4.1 Write `openspec/changes/port-ithy-opsx-dispatch-to-universal-source/outcome.md` capturing:
  - What was ported and any content issues encountered
  - Whether the verbatim copy needed any tweaks for portable-markdown compatibility
  - Follow-up: which skills to port next (archive / merge / revert / answer / escalate / review / verify / dispatch-multi / apply / import — 10 remaining)
