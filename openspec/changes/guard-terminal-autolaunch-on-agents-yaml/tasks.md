# Tasks

## 1. Locate the auto-launch decision points

- [x] 1.1 In `server/`, find the PTY auto-launch injection path (likely `server/sync/pty.ts` or wherever `[pty] auto-launching: tmux new-session ... -- claude --resume ...` is logged from). Note the current unconditional trigger.
- [x] 1.2 In `vscode-extension/src/extension.ts`, find the terminal auto-open logic tied to the `ithyno.autoLaunchTerminal` setting.
- [x] 1.3 In `web/src/App.tsx` (or the store), find whether/how the web dashboard triggers the auto-launch. (If it's server-side driven, no web change needed.)

## 2. Guard: check agents.yaml presence

- [x] 2.1 Add a helper `hasAgentsYaml(projectRoot: string): boolean` in `server/agents/registry.ts` (or a new `server/agents/config-presence.ts`). Returns true if `<projectRoot>/agents.yaml` exists as a readable file. False otherwise (including missing, unreadable, or symlink to non-file).
- [x] 2.2 In the PTY auto-launch code path, call `hasAgentsYaml(projectRoot)` before deciding whether to inject the Claude-startup command. If false, skip the injection (PTY still spawns a shell — user gets a bash/zsh prompt, no Claude auto-invocation).
- [x] 2.3 Log the decision explicitly: `[pty] auto-launch skipped — no agents.yaml at <projectRoot>` on the guard-hit path.

## 3. VS Code extension parity

- [x] 3.1 In `vscode-extension/src/extension.ts`, before opening the terminal on activation (or whenever the current `ithyno.autoLaunchTerminal` setting is consulted), check for `<projectRoot>/agents.yaml`. If missing, do NOT open the terminal, even when the setting is true.
- [x] 3.2 Update the `ithyno.autoLaunchTerminal` setting description in `vscode-extension/package.json` to reflect the new semantic: "When true (the default), auto-open the ithyno terminal AND auto-launch its startup command — but only when `agents.yaml` is present at the project root. Projects without agents.yaml never auto-launch."

## 4. Dashboard hint (optional but recommended)

- [x] 4.1 Extend `GET /api/state` to include `hasAgentsYaml: boolean` (in addition to `hasClaudeMd` from `unify-open-project-3-branch` if that change is landed first; otherwise add just this one field).
- [x] 4.2 In `web/src/App.tsx`, when the project loads AND `hasAgentsYaml === false`, render a small unobtrusive hint (a footer toast or a Settings-page card) explaining that auto-launch is off and how to enable it. Not blocking; dismissible.

## 5. Tests

- [x] 5.1 In `server/agents/registry.test.ts` (or a new file), test the `hasAgentsYaml` helper: returns true when file exists, false when missing, false on directory-at-path, false on symlink-to-directory.
- [x] 5.2 Integration-ish test: spawn a PTY in a fixture project WITHOUT agents.yaml, assert the auto-launch injection is NOT sent. Repeat WITH agents.yaml, assert injection IS sent.

## 6. Verification

- [x] 6.1 `npm run openspec -- validate guard-terminal-autolaunch-on-agents-yaml --strict` passes.
- [x] 6.2 `npm test` passes.
- [x] 6.3 `npm run typecheck` passes.
- [x] 6.4 `npm run build` passes.
- [ ] 6.5 Manual (Electron): open a project that has NO agents.yaml (e.g., a freshly-`openspec init`-ed folder). Terminal panel visible but the shell prompts to bash/zsh only — no Claude spawn. Server log shows `[pty] auto-launch skipped — no agents.yaml`.
- [ ] 6.6 Manual (Electron): open a project that HAS agents.yaml (e.g., openspec-ui itself). Terminal auto-launches Claude as today. Server log shows the standard `[pty] auto-launching: tmux ...`.
- [ ] 6.7 Manual (VS Code): install the vsix. Open a folder without agents.yaml. Terminal does NOT auto-open. Open a folder WITH agents.yaml. Terminal opens + Claude launches as today.
- [ ] 6.8 Manual: on a no-agents-yaml project, use the terminal size toggle to click through states. Manual open (default state) triggers a normal PTY spawn — no Claude auto-invocation, just a shell. User can `claude` manually to opt in.
- [x] 6.9 Write `openspec/changes/guard-terminal-autolaunch-on-agents-yaml/outcome.md` (✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups).
