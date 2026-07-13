## 1. Server: /api/system/pick-executable

- [ ] 1.1 `server/system/pick-executable.ts` — new module: `pickExecutable()` dispatches on `process.platform` (darwin: `osascript`; linux: `zenity` with graceful fallback; win32: PowerShell OpenFileDialog); returns `{ path: string | null; error?: string }`
- [ ] 1.2 `server/index.ts` — `POST /api/system/pick-executable` handler with `isLocal` gate; wraps `pickExecutable()`; 403 on non-loopback

## 2. Client: Modal Browse button

- [ ] 2.1 `web/src/api.ts` — `pickSystemExecutable(): Promise<{ path: string | null; error?: string }>`
- [ ] 2.2 `web/src/components/AgentConfigModal.tsx` — inline `[Browse…]` button next to the command input; on click, calls the API and fills the field with the returned path
- [ ] 2.3 Handles null / cancel (field untouched); surfaces `error` inline; other failures via toast

## 3. Client: args presets

- [ ] 3.1 `web/src/agent-cli-presets.ts` — preset map `{ [basename]: { [role]: { args: string[]; initialInput?: string } } }` for claude / aider / codex / gh / agy. Stubs for unknown flags carry a `todo: true` marker
- [ ] 3.2 `AgentConfigModal.tsx` — when `(basename(command), role)` matches a preset, render `[Use preset for <cmd> / <role>]` (or `... TODO fill flags` when stub) below the args field. Click replaces args + initialInput

## 4. Presets — initial entries

- [ ] 4.1 `claude`: code / review / verify / manager — `--dangerously-skip-permissions -p /opsx:{apply,review,verify} ${change_id}` (worker); `--continue` + `/opsx:manage` (manager)
- [ ] 4.2 `aider`: code — `--yes-always` + `Implement OpenSpec change ${change_id}`
- [ ] 4.3 `codex`: TODO stub (flags unknown at ship time)
- [ ] 4.4 `gh` (copilot): code — `copilot suggest` + prompt as initialInput
- [ ] 4.5 `agy` (antigravity): TODO stub (flags unknown at ship time)

## 5. CSS

- [ ] 5.1 `web/src/styles.css` — `.agent-config-command-row` (flex: input + Browse button); `.agent-config-preset-btn` (small ghost button under args field)

## 6. Spec deltas

- [x] 6.1 3 ADDED requirements in `specs/dashboard/spec.md`
- [ ] 6.2 `npm run openspec -- validate add-modal-command-picker-and-presets` VALID

## 7. Tests

- [ ] 7.1 `server/system/pick-executable.test.ts` — unit tests for the platform dispatcher (mock `execFile`); cancel (empty stdout) → `{path: null}`; missing zenity → `{path: null, error: "..."}`
- [ ] 7.2 `web/src/agent-cli-presets.test.ts` — lookup by basename works with full paths and bare names

## 8. Verification

- [ ] 8.1 `npm test && npm run typecheck && npm run build` clean
- [ ] 8.2 UI: `[Browse…]` button appears next to the command input in the Modal
- [ ] 8.3 UI: clicking `[Browse…]` opens the native OS file picker; picking an executable fills the command field
- [ ] 8.4 UI: canceling the picker leaves the command field unchanged
- [ ] 8.5 UI (Linux without zenity): clicking `[Browse…]` surfaces an inline hint "Native picker unavailable — type the path manually"
- [ ] 8.6 UI: with `command="claude"` and `role="code"`, a `[Use preset for claude / code]` button appears below the args field
- [ ] 8.7 UI: clicking the preset button replaces args and initialInput with the preset values
- [ ] 8.8 UI: `command="/opt/homebrew/bin/claude"` also matches the `claude` preset (basename lookup)
- [ ] 8.9 UI: `command="myscript"` shows no preset button
- [ ] 8.10 UI: `command="agy"` preset button label includes `TODO fill flags`
- [ ] 8.11 API: `curl` a non-loopback POST to `/api/system/pick-executable` → 403

## 9. Post-impl

- [ ] 9.1 phase-workflow へ merge (worktree flow)
- [ ] 9.2 archive → user runs `/ithy-opsx:archive` after confirming 8.2–8.11
- [ ] 9.3 rebuild dist so the UI on :55910 picks up the new bundle
