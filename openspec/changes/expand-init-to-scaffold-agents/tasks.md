# Tasks

## 1. Init endpoint extension

- [x] 1.1 In the `POST /api/init` handler, before scaffolding, call `runDoctor()` (imported from `server/doctor.ts`, landed by `add-doctor-and-installer`). If `readyForManager === false`, return 409 with `{ error, hint: "check ithyno doctor or Settings > Prerequisites" }`.
- [x] 1.2 Accept an optional `manager.command: Cli` in the request body. Validate against the doctor's `agents` map — the requested CLI must be `installed === true`. If not, return 400 with `{ error, installed: [<list of installed>] }`.
- [x] 1.3 When `manager` is omitted, pick from `req.body.defaultManager` OR (if that's also missing) the doctor's first-installed by priority order (`claude > codex > agy > copilot > gemini > opencode > cursor`).
- [x] 1.4 After `openspec init` succeeds, read `templates/agents.yaml.tmpl` (new dedicated template file), substitute `{{MANAGER_COMMAND}}` → chosen CLI, write to `<projectRoot>/agents.yaml`. If write fails, roll back the openspec/ scaffolding and return 500.
- [x] 1.5 Response gains `managerCommand: <chosen CLI>` alongside the existing shape.

## 2. Templates

- [x] 2.1 Add `templates/agents.yaml.tmpl` — minimal template with a single Manager entry:
  ```yaml
  agents:
    - name: manager
      roles: [manager]
      mode: live-shell
      command: {{MANAGER_COMMAND}}
      args: [--continue]
  ```
- [x] 2.2 Keep `agents.yaml.example` as human-readable reference. Add a comment at the top pointing at `templates/agents.yaml.tmpl` as the Init-time source.

## 3. Init dialog UI

- [x] 3.1 In `web/src/components/NoProjectDecisionPanel.tsx`, before the Initialize button click actually POSTs to `/api/init`, open an `<InitDialog />` (new component) that:
  - Fetches `/api/doctor` on mount, renders a compact Prerequisites summary (green checks + red x's).
  - If `readyForManager === false`: dashboard blocks the Init CTA and shows a link "Fix in Settings > Prerequisites".
  - Else: shows a Manager picker (dropdown limited to installed agent CLIs), defaulting to Settings' `defaultManager` or the priority-fallback.
  - The Init button in the dialog POSTs `/api/init` with `{ dir, manager: { command } }`.
- [x] 3.2 Also expose the same dialog on `web/src/pages/OnboardingProject.tsx` — the new-project onboarding uses the same flow.
- [x] 3.3 On success, dialog closes and dashboard refetches state as before.

## 4. Settings — defaultManager preference

- [x] 4.1 In `web/src/store.ts`, add `defaultManager: Cli | null` (initial null → resolved from priority order on first read), and `setDefaultManager(cli: Cli)` action. Persist to localStorage under `ithyno.defaultManager`.
- [x] 4.2 In `web/src/pages/Settings.tsx`, below the Prerequisites section (added by `add-doctor-and-installer`), add a "Default Manager" radio group limited to installed agents.
- [x] 4.3 When the user picks one, dispatched by the store, persisted, and used by the Init dialog as the default.

## 5. Tests

- [x] 5.1 `server/init.test.ts` — new test cases:
  - 409 when doctor.readyForManager is false
  - 400 when requested manager.command is not installed
  - 200 with `managerCommand` when omitted (picks priority default)
  - agents.yaml is written at `<projectRoot>/agents.yaml` with the correct command
- [x] 5.2 `web/src/components/InitDialog.test.ts` — assert Prerequisites summary renders, blocked state, Manager picker limits to installed.
- [x] 5.3 `web/src/pages/Settings.test.ts` — defaultManager radio persists.

## 6. Verification

- [x] 6.1 `npm run openspec -- validate expand-init-to-scaffold-agents --strict` passes.
- [x] 6.2 `npm test` passes.
- [x] 6.3 `npm run typecheck` passes.
- [x] 6.4 `npm run build` passes.
- [ ] 6.5 Manual: open ithyno at a fresh dir with only claude installed → Init dialog picks claude, Init produces openspec/ + agents.yaml → terminal auto-launches Manager → ready state.
- [ ] 6.6 Manual: same but with no agent CLI installed → Init dialog blocks with the Prerequisites link.
- [ ] 6.7 Manual: change defaultManager to codex in Settings, then run Init on a different dir → Init dialog defaults to codex.
- [x] 6.8 Write `openspec/changes/expand-init-to-scaffold-agents/outcome.md`.
