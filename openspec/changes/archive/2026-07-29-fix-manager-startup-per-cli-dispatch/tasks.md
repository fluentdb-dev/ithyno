# Tasks

> All items completed by commit `4d1687b` (impl-first retrofit).
> Each task links back to the file/line touched so verification is
> reproducible.

## 1. Template default

- [x] 1.1 `templates/agents.yaml.tmpl` — remove `args: [--continue]`; write `args: []` with an explanatory comment naming the runtime dispatch as authority.

## 2. Per-CLI Manager startup dispatch

- [x] 2.1 `server/sync/pty.ts` — rename `resolveSessionIdStartup` → `resolveClaudeSessionStartup` (was misnamed as generic).
- [x] 2.2 Add `MANAGER_STARTUP_STRATEGIES: Readonly<Record<string, ManagerStartupStrategy>>` table. Populate with `claude: resolveClaudeSessionStartup`. Leave codex/agy/copilot/gemini/opencode/cursor slots unregistered (each is its own per-CLI research follow-up).
- [x] 2.3 Export `resolveManagerStartup(command, projectRoot)` — dispatches to strategy table, falls back to plain command.
- [x] 2.4 `ptyStartup()` — when `manager.args.length === 0`, call `resolveManagerStartup(manager.command, projectRoot)` instead of joining raw args. Explicit args still win (backward compat).

## 3. Session-id file per-CLI split

- [x] 3.1 `resolveClaudeSessionStartup` — write fresh mints to `.ithyno/session-claude` (was `.ithyno/session-id`).
- [x] 3.2 Read fallback: try `session-claude` first, then legacy `session-id`. Never rewrite the legacy path (existing dev envs converge naturally on next mint).

## 4. Manager picker gating

- [x] 4.1 `web/src/components/InitDialog.tsx` — introduce `MANAGER_VERIFIED = ["claude"]` and `MANAGER_UNVERIFIED = ["codex", "agy"]` constants. `MANAGER_CANDIDATES = union`.
- [x] 4.2 Add `isManagerCandidate(cli)` / `isManagerUnverified(cli)` helpers.
- [x] 4.3 Compute `managerChoices = installedClis.filter(isManagerCandidate)` — this is what the picker iterates over.
- [x] 4.4 `readyForManager` is now derived from `managerChoices.length > 0` instead of the raw doctor field (a project with only copilot installed correctly reports "no Manager-eligible CLI").
- [x] 4.5 Preselect logic — respect the candidate filter (defaultManager kept only if still eligible; otherwise fall to first eligible-installed).
- [x] 4.6 Picker label — append ` (動作未確認)` for `MANAGER_UNVERIFIED` entries; verified entries render plain.

## 5. Tests

- [x] 5.1 `server/sync/pty.test.ts` — 7 new tests for per-CLI dispatch:
  - `resolveManagerStartup(claude, root)` mints session file on first launch
  - `resolveManagerStartup(codex, root)` returns plain `"codex"`
  - `resolveManagerStartup(agy, undefined)` returns plain `"agy"`
  - `resolveManagerStartup(claude, undefined)` returns plain `"claude"` (no projectRoot for session file)
  - `ptyStartup` with `command: claude, args: []` uses smart session dispatch (NOT `--continue`)
  - `ptyStartup` with `command: codex, args: []` returns plain `"codex"`
  - `ptyStartup` with explicit args honors them (backward compat)
- [x] 5.2 `server/sync/pty.test.ts` — rename 3 existing tests: session-id → session-claude. Add explicit legacy-fallback test.
- [x] 5.3 `web/src/components/InitDialog.test.ts` — 7 new tests for candidate filter:
  - candidate list == `[claude, codex, agy]`
  - copilot/gemini/opencode/cursor/antigravity NOT in candidates
  - codex/agy are unverified; claude is verified
  - picker combines: `installed ∩ candidates` yields expected sets
  - edge case: only copilot installed → picker empty

## 6. Verification

- [x] 6.1 `npm test` — 631 pass / 1 unrelated (sharp missing in this env).
- [x] 6.2 `npm run typecheck` — clean.
- [x] 6.3 `npm run build` — clean.
- [x] 6.4 `npm run openspec -- validate --all --strict` — 42/42 pass (this change validated separately once written).
- [x] 6.5 `npm run openspec -- validate fix-manager-startup-per-cli-dispatch --strict` — VALID.
- [x] 6.6 Write `outcome.md` capturing the retrofit lesson (framing bug fix vs spec-level change).

## 7. Follow-ups (out of scope, tracked here for reference)

- [ ] 7.1 Per-CLI session strategy for `codex` — needs research on Codex's resume mechanism.
- [ ] 7.2 Per-CLI session strategy for `agy`.
- [ ] 7.3 Once `codex` verified working as Manager (dispatch skill ported by `generalize-skills-cross-cli` follow-up + strategy landed), drop it from `MANAGER_UNVERIFIED`.
- [ ] 7.4 Same for `agy`.
- [ ] 7.5 When Copilot/Gemini/Opencode/Cursor gain Manager support, add them to `MANAGER_VERIFIED` (or `_UNVERIFIED` transitionally) — they're currently hidden entirely.
