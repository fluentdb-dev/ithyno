## 1. Schema types

- [x] 1.1 `server/agents/registry.ts` — new fields on `AgentDef`: `mode: "single-prompt" | "live-shell"`, `roles: string[]`, `prompts?: Record<string, string>`
- [x] 1.2 `server/agents/registry.ts` — new field on `RuntimeDef`: `prompts?: Record<string, string>`
- [x] 1.3 `web/src/types.ts` — mirror types for `AgentPublic`, `RuntimeDefPublic`, and the `AgentConfigPayload` discriminated union
- [x] 1.4 Deprecated fields (`role`, `initialInput`, `prompt` at agent level) remain as read-aliases on `AgentDef`/`AgentPublic` (populated from `roles[0]` + `prompts[roles[0]]`) for downstream consumers that predate the reshape; the write path (config-writer) never emits them

## 2. Server: loader normalization

- [x] 2.1 `server/agents/registry.ts` — `normalizeAgent(rawAgent)` step folds legacy shapes into the new schema: scalar `role` → `roles: [role]`, `initialInput` → `prompts[sole-role]`, `prompt` → `prompts[sole-role]`, synthesizes `mode` from role (`manager → live-shell`, else `single-prompt`), aliases `coder → code`
- [x] 2.2 Load-time warnings — every normalization pushes a message into `AgentConfig.warnings` and `console.warn`s. Warnings surface through `publicConfig().warnings` for the dashboard to render
- [x] 2.3 Manager singleton — post-normalization check that at most one agent has `manager` in `roles`; violation → load-time error naming both agents
- [x] 2.4 Manager mode gate — post-normalization check that any agent with `manager` in `roles` has `mode: live-shell`; violation → load-time error
- [x] 2.5 `initialInput`/`prompt` on multi-role — hand-edited entry with `roles: [x, y]` AND legacy `initialInput`/`prompt` → load-time error identifying the ambiguity
- [x] 2.6 Custom role names — accepted (open set beyond `code | review | verify | manager | other`); dispatch fails at resolve time when no `prompts.<role>` is set AND no built-in default exists (`role: other` case)

## 3. Server: runner + dispatch

- [x] 3.1 `server/agents/registry.ts` — `resolve()` branches on `agent.mode`:
  - `single-prompt` + `promptStyle: cli-arg` → args appended with `[promptFlag, resolvedPrompt]` when the agent inherits from a runtime; command-only agents own their args
  - `single-prompt` + `promptStyle: stdin` → prompt delivered via `child.stdin`
  - `live-shell` → prompt returned via `initialInputMode: "pty"` for the Manager panel to type into the PTY
- [x] 3.2 `server/agents/registry.ts` — new `resolvePromptForRole(agent, runtimes, role)` helper implements the 3-tier resolution (`agent.prompts` → `runtime.prompts` → built-in default); template substitution runs on the result
- [x] 3.3 `resolve()` throws when a live-shell / stdin path has no prompt at any resolution tier ("no prompt configured for role X"); cli-arg path silently no-ops (respecting the command-only "user owns args" contract)
- [x] 3.4 `server/agents/dispatch.ts` — selector matches `request.role` against `agent.roles.includes(request.role)`; all other selection logic (specialties, runtime filter, order) unchanged
- [x] 3.5 Job model — `runner.run()` accepts an optional `dispatchedRole` param; `job.role` is set from it (falls back to `agent.roles[0]` for the legacy single-arg call path). A multi-role agent produces separate jobs labeled with the specific requested role

## 4. Client: Modal

- [x] 4.1 `web/src/components/AgentConfigModal.tsx` — removed `shape` toggle; added `mode` toggle (2 radio buttons: single-prompt, live-shell)
- [x] 4.2 `AgentConfigModal.tsx` — changed role dropdown to `roles` multi-select (chip-based, click to toggle)
- [x] 4.3 `AgentConfigModal.tsx` — removed `initialInput` textarea entirely
- [x] 4.4 `AgentConfigModal.tsx` — removed standalone `prompt` field; renders one prompt textarea per role in `roles[]`, labeled `"Prompt for role: <role>"`, with a resolution-chain hint below each (Custom / runtime:<name> / built-in / no-default)
- [x] 4.5 `AgentConfigModal.tsx` — runtime dropdown becomes "— none (specify command below) —" as the empty option; when set, `command` and `args` inputs show inherited-value placeholder text
- [x] 4.6 Manager singleton in Modal — the `manager` option in the `roles` multi-select is hidden when another agent already declares it, unless the current agent being edited IS that agent (same logic as pre-reshape, ported to multi-select)
- [x] 4.7 Manager mode enforcement in Modal — if `manager` ∈ `roles`, forces `mode: live-shell` via a `useEffect` (disables the single-prompt radio) with a helper text explaining why

## 5. agents.yaml.example

- [x] 5.1 Rewrote in the new schema: header docs the new fields, built-in prompt defaults, backward-compat rules; example agents show (a) commented Manager, (b) a single-role Claude worker, (c) commented multi-role worker, (d) commented runtime-referenced worker, (e) commented aider example
- [x] 5.2 Backward-compat rules documented at the top of the file (old shapes still load with a warning)

## 6. CSS

- [x] 6.1 `web/src/styles.css` — `.agent-config-roles-multi` (chip-based multi-select styling), `.agent-config-mode`, `.agent-config-prompts` (fieldset containers), `.agent-config-role-chip`/`.agent-config-role-chip-on` (chip styling), `.agent-config-prompt-chain-hint` (muted text under prompt textareas), `.agent-config-hint` (Manager-mode helper text)

## 7. Tests

- [x] 7.1 `server/agents/registry-reshape.test.ts` — 16 tests covering normalization (scalar role, coder→code alias, initialInput fold, prompt fold, mode synthesis for manager and non-manager), fatal cases (multi-role initialInput, second manager, manager without live-shell, both role and roles declared), multi-role dispatch, and `resolvePromptForRole` 3-tier resolution
- [x] 7.2 `server/agents/registry-initial-input.test.ts` — rewritten to test the new `prompts` map and `mode` branch behavior (live-shell → PTY delivery, command-only single-prompt → user owns args, env substitution)
- [x] 7.3 `server/agents/registry.test.ts` — updated legacy tests to assert new default (`role: code`) and new resolved-args ordering for runtime-inherited prompts
- [x] 7.4 `server/agents/registry-runtime.test.ts` — updated to assert the new relaxed rules (runtime + command coexist as overrides, bare runtime without prompt is valid, bare `prompt` without runtime still rejected)
- [x] 7.5 `server/agents/config-writer.test.ts` — updated payload literals to the new schema (`roles`, `mode`, `prompts`); added new coverage for the manager-without-live-shell rejection, the empty-`roles` rejection, and the scalar-`role` grace-period acceptance
- [x] 7.6 `web/src/util/changeState.test.ts` — updated `AgentPublic` literal to include `mode` and `roles`
- [ ] 7.7 `web/src/components/AgentConfigModal.test.tsx` — full Modal reshape integration test (mode toggle, roles multi-select chip toggling, per-role prompt textareas appearing/disappearing) deferred; the existing kebab-case regex test still passes

## 8. Spec deltas

- [x] 8.1 3 ADDED + 6 MODIFIED requirements in `specs/dashboard/spec.md`
- [x] 8.2 `npm run openspec -- validate reshape-agents-yaml-mode-roles` VALID
- [x] 8.3 PENDING annotations on all 6 MODIFIED requirements in `openspec/specs/dashboard/spec.md`

## 9. Verification

- [x] 9.1 `npm test && npm run typecheck && npm run build` clean (289 tests, 2 skipped)
- [ ] 9.2 UI: Modal shows `mode` toggle (single-prompt / live-shell) instead of the old shape toggle
- [ ] 9.3 UI: Modal shows `roles` multi-select with chips; adding `code` + `review` + `verify` all shows a prompt textarea per role
- [ ] 9.4 UI: with runtime `claude` selected, each prompt textarea shows an inherited-default hint below it
- [ ] 9.5 UI: selecting `manager` in `roles` disables the single-prompt radio and forces `mode: live-shell`
- [ ] 9.6 UI: Modal's `roles` multi-select hides `manager` when another agent already declares it, unless editing that agent
- [ ] 9.7 UI: `initialInput` textarea is gone from the Modal entirely
- [x] 9.8 Loader: legacy `agents.yaml` (scalar role + initialInput) loads with warnings (`publicConfig().warnings` populated); agents remain functional. Verified via smoke-load of the live `agents.yaml`: 2 warnings, agent normalized to `roles: [code]` + `mode: single-prompt`
- [x] 9.9 Loader: hand-edited `agents.yaml` with 2 agents having `manager` in `roles` produces a load error (covered by `registry-reshape.test.ts`)
- [ ] 9.10 Dispatch: multi-role agent (`roles: [code, review, verify]`) selected by all 3 dispatch requests; jobs list shows 3 separate entries with the dispatched role
- [ ] 9.11 Round-trip: opening an old-shape agent in the Modal shows the normalized state populated in the new fields; saving writes the new shape and drops the old fields
- [x] 9.12 `role: other` agent without `prompts.other` — `resolvePromptForRole` returns undefined; live-shell / stdin path throws a clear error at dispatch time (covered by `registry-reshape.test.ts`)

## 10. Post-impl

- [ ] 10.1 phase-workflow へ merge (worktree flow)
- [ ] 10.2 archive → user runs `/ithy-opsx:archive` after confirming 9.2–9.11 in the UI
- [x] 10.3 rebuild dist so the UI on :55910 picks up the new bundle (build ran clean)
- [ ] 10.4 Update `docs/ideas/2026-07-13-agent-roles-user-manual-entry.md` — add note that agents can now hold multiple roles
- [x] 10.5 Updated `docs/ideas/2026-07-13-collapse-agent-shape-into-mode-and-roles.md` frontmatter → `status: promoted`, `promoted_to: openspec/changes/reshape-agents-yaml-mode-roles/`
- [ ] 10.6 Reshape `openspec/changes/add-modal-command-picker-and-presets/` proposal + tasks + spec so presets populate `command`, `args`, and `prompts` (per-role) on the new schema; preset button becomes a "prefill from CLI" affordance
