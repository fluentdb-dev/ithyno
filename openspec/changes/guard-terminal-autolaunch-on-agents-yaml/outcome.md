# Outcome: guard-terminal-autolaunch-on-agents-yaml

## Worked

- Added `hasAgentsYaml(projectRoot: string): boolean` as a standalone exported
  function in `server/agents/registry.ts`. Also exposed as an instance method
  on `AgentRegistry` delegating to the same logic. Uses `existsSync` + `statSync`
  to reject directories and symlinks-to-directories.
- `attachPtyToSocket` in `server/sync/pty.ts` now checks `hasAgentsYaml(opts.cwd)`
  before firing the startup injection. Guard-hit logs
  `[pty] auto-launch skipped — no agents.yaml at <path>`. The PTY still spawns a
  plain shell — manual use is never blocked.
- `GET /api/state` response (`scanWorkspace`) includes `hasAgentsYaml: boolean`
  as an additive field. Both `server/model.ts` and `web/src/types.ts` carry the
  field.
- VS Code extension (`vscode-extension/src/extension.ts`) gates the auto-launch
  path on `workspaceHasAgentsYaml(workspaceRoot)` using the same
  `existsSync + statSync` pattern. `vscode-extension/package.json`
  `ithyno.autoLaunchTerminal` description updated to reflect the new conditional
  semantic.
- Dashboard hint: Settings page renders an `.info-banner` when
  `state.hasAgentsYaml === false`. Unobtrusive; does not block navigation.
- Unit tests: 6 cases for `hasAgentsYaml` (absent, present, directory,
  non-existent root, symlink-to-file, symlink-to-dir).
- Integration tests: 2 composition cases in `pty.test.ts` confirming the
  guard returns false without agents.yaml and true with it.

## Surprises

- The `AgentRegistry` already called `existsSync` in `load()` but didn't
  expose the result externally. Adding a stateless helper function alongside
  the class was cleaner than threading a flag through the registry cache.
- `attachPtyToSocket` uses `opts.cwd` as the project root. That is correct
  because the dashboard always passes the project root as `cwd` when spawning
  the embedded PTY.
- The client-side `WorkspaceState` type in `web/src/types.ts` is a manual
  mirror of the server model — it needed updating in parallel with
  `server/model.ts`. No codegen exists; the field was added to both.

## Differently

- The `AgentRegistry` instance's `hasAgentsYaml()` method simply re-checks the
  filesystem rather than caching the loaded state. This is intentional: the
  file can appear or disappear between loads (e.g., user deletes agents.yaml
  while the server is running). A live `existsSync` check is cheaper than
  re-loading the registry and more accurate than a stale cache.
- Dashboard hint placed on the Settings page rather than as a global footer
  toast — a persistent toast would be distracting; the Settings page is where
  users look for agent configuration options.

## Follow-ups

- Consider adding a real-time `agents-yaml-changed` WS event so the dashboard
  banner dismisses automatically when the user adds `agents.yaml` without
  reloading the page.
- The VS Code extension does not actively notify the user when auto-launch is
  suppressed (no status-bar item or message). A low-priority follow-up could
  show a one-time info notification on first activation with a no-agents-yaml
  workspace.
