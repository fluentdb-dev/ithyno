# Tasks

## 1. New skill

- [ ] 1.1 Add `.claude/commands/ithy-opsx/import.md` — the slash-command entry point that references the skill file.
- [ ] 1.2 Add `.claude/skills/ithy-opsx-import/SKILL.md` — the skill body. Structure:
  - Input: `<target-path>` argument
  - Preflight: verify `target-path` exists as a directory, verify `openspec/` does NOT already exist under it (defensive; server already checks)
  - Call Task tool with `subagent_type: "claude"`, sensible model (inherit or explicit `sonnet`), `cwd: <target-path>` semantics baked into boot prompt (Task-tool sub-agents inherit parent cwd, so `cd <target-path>` is the first line of the boot prompt)
  - Boot prompt template — see task 1.3
  - Return a summary line so Manager can observe completion
- [ ] 1.3 Author the boot prompt template used by task 1.2. Include:
  - "You are the import sub-agent for `<target-path>`. `cd` there first."
  - Discovery: "Read `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/**/*.md`, and a bounded sample of the source tree (Flutter → `lib/`; Node → `src/` or `server/` + `web/`; Rust → `src/`; Python → `src/` or package name; fallback → top-level dirs). Cap at ~5000 lines total."
  - "Read `package.json` / `pubspec.yaml` / `Cargo.toml` / `pyproject.toml` for the stated purpose + declared dependencies."
  - "Run `openspec init` at `<target-path>`."
  - "For each capability you identify, write `openspec/specs/<capability>/spec.md`. Every requirement follows OpenSpec's SHALL + Scenario shape. Run `openspec validate --all --strict` to confirm."
  - "Write `openspec/GENERATED.md` at project root with a header (LLM-generated drafts), the timestamp, and a per-capability list."
  - "DO NOT commit. Leave openspec/ files untracked."
  - Return format: "In your final message, output a JSON blob `{ capabilities: [...], notes: '<what you observed>' }` so Manager can log it."

## 2. Server endpoint changes

- [ ] 2.1 In `server/import-spec-gen.ts` (rename → `server/import.ts`? keep name to minimize churn), delete the subprocess spawn code path: no more `spawn('claude', ['-p', ...])`, no `10min timeout` + `SIGKILL grace`, no `jobs` Map + LRU eviction, no `subscribeToJob` / listener leak plumbing.
- [ ] 2.2 Retain the preflight checks (existing openspec/ → 409, size cap → 400, unauthorized path → 403) and the `POST` endpoint shape (input: `{ projectRoot, force?, dry? }`).
- [ ] 2.3 Rewrite the successful-request path: instead of spawning subprocess, inject the string `/ithy-opsx:import <targetPath>` into the ithyno-side Manager PTY using the existing `add-agent-stdin-relay` inject mechanism (grep `server/agents/relay.ts` or wherever the Kanban Start button injects from). Return `{ jobId, targetPath }` synchronously.
- [ ] 2.4 Delete the SSE endpoint `GET /api/import/spec-generation/:jobId/events` and its route registration. Any WS/SSE listener state introduced by this feature is removed.
- [ ] 2.5 Add a 503 response path when the Manager PTY isn't running (see spec: "Manager session is required" scenario). Query the PTY registry: if there's no active Manager, return 503 with a message like `{ error: "Manager PTY not running; add agents.yaml to the ithyno project root and restart ithyno." }`.

## 3. Dashboard UI changes

- [ ] 3.1 In `web/src/components/ImportProgress.tsx`, delete the EventSource consumer. Replace with a subscription to the existing WS `state-replaced` broadcast (via the store). The component's job is now:
  - render "Import in progress..." + a subtle spinner
  - when state-replaced fires AND the newly-loaded state has `exists === true` AND (optionally) `openspec/GENERATED.md` is present in the workspace, call `onComplete(state)`
- [ ] 3.2 Simplify `ImportConfirmModal.tsx` — the confirm response no longer carries `estimatedContextBytes` from a dry-run. Either keep the dry-run response minimal (just the preflight decision) or remove the confirm modal entirely and go directly from "Import: generate specs" button → dispatched-to-Manager toast → progress → completion. Discuss during implementation; default to keeping the modal as a "you're about to spawn an LLM sub-agent, click to confirm" gate.
- [ ] 3.3 Delete `web/src/components/ImportProgress.test.ts` cases that mock EventSource; replace with cases that pump state-replaced through the store.

## 4. State signal detection

- [ ] 4.1 Extend `GET /api/state` (or the WS state-replaced payload) to include a `generatedMarkerPresent: boolean` field — true when `openspec/GENERATED.md` exists at the current project's root. The dashboard uses this to decide whether to render the LLM-generated banner.
- [ ] 4.2 The workspace scanner (`server/parser/workspace.ts`) already reads `hasClaudeMd` + `hasAgentsYaml`; add `generatedMarkerPresent` alongside. Non-breaking additive field.

## 5. Cleanup + removals

- [ ] 5.1 Delete `server/import-spec-gen.test.ts` cases that assert subprocess spawn behavior (timeout / SIGKILL / stdin plumbing). Replace with tests for the new inject-to-Manager path.
- [ ] 5.2 Update `server/index.ts` route registrations: remove the SSE route, keep the POST route.
- [ ] 5.3 The `openspec/changes/archive/2026-07-22-import-project-spec-generation/` archive is left as-is (historical record). This change's outcome.md notes that its earlier design was replaced.

## 6. Skill wiring

- [ ] 6.1 Register the new slash command in `.claude/commands/ithy-opsx/import.md` following the existing skill entry pattern (dispatch, apply, archive, merge, revert).
- [ ] 6.2 Update `CLAUDE.md` if the skill needs a mention alongside the standard `/opsx:propose → /opsx:apply → /ithy-opsx:archive` sequence. Import is a bootstrap operation, not a standard change, so may not need a mention.

## 7. Tests

- [ ] 7.1 `server/import.test.ts` — test the preflight (409 on existing openspec/, 400 on oversized, 403 on unauthorized path, 503 on Manager missing) and the successful inject-to-Manager path (mock the PTY relay, assert the correct string was injected).
- [ ] 7.2 `web/src/components/ImportProgress.test.ts` — test the state-replaced → onComplete flow (pump state into the store, assert onComplete fires when the new state has `openspec/GENERATED.md`).
- [ ] 7.3 Skill unit test (if the skill layer has a test harness) — validate the boot prompt template renders correctly with a target path.

## 8. Verification

- [ ] 8.1 `npm run openspec -- validate refactor-import-to-task-tool-subagent --strict` passes.
- [ ] 8.2 `npm test` passes.
- [ ] 8.3 `npm run typecheck` passes.
- [ ] 8.4 `npm run build` passes.
- [ ] 8.5 Manual: run ithyno with agents.yaml present → open a non-openspec target project (Electron menu → File → Import Existing Project…) → Confirm modal → dispatched → Manager PTY receives `/ithy-opsx:import <path>` → Task-tool sub-agent runs → openspec/GENERATED.md appears in target → dashboard transitions to Kanban.
- [ ] 8.6 Manual: run ithyno WITHOUT agents.yaml (Manager PTY not running) → hit Import → server returns 503, dashboard shows a friendly error.
- [ ] 8.7 Manual: verify Manager's context does NOT get flooded with the sub-agent's discovery reads (inspect Manager's session transcript — only summary should appear).
- [ ] 8.8 Manual: `git status` on target project after import → openspec/ files untracked, no auto-commit.
- [ ] 8.9 Manual: verify no `claude -p` subprocess appears in `ps` during import.
- [ ] 8.10 Write `openspec/changes/refactor-import-to-task-tool-subagent/outcome.md` (✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups).
