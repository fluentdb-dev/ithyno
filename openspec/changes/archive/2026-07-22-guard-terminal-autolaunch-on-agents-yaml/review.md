---
verdict: pass
reviewer: manager-fallback
model: sonnet
change_id: guard-terminal-autolaunch-on-agents-yaml
---

# Review

## Findings

### Finding 1 (severity: minor)
**File**: server/sync/pty.ts:313–338
**Issue**: `ptyStartup()` is called unconditionally before the `hasAgentsYaml` guard. When there is no `agents.yaml`, `ptyStartup` falls through to `resolveSessionIdStartup`, which mints a UUID and writes `.ithyno/session-id` to disk. The guard then correctly suppresses the terminal write, but the side-effect (session-id file creation) still happens for every WebSocket PTY connection on a project that has no agents.yaml.
**Fix**: Move the `hasAgentsYaml` check before `ptyStartup`, or pass the guard result into `ptyStartup` so it short-circuits before touching the filesystem. Alternatively, accept the side-effect as harmless — the file is small and idempotent — and document it. Not blocking, but worth noting for callers that rely on session-id absence as a signal.

### Finding 2 (severity: minor)
**File**: server/sync/pty.ts:315 vs server/agents/registry.ts:1056 caller context
**Issue**: The `attachPtyToSocket` guard calls the standalone `hasAgentsYaml(opts.cwd)` function (a fresh `existsSync + statSync` probe at call time) rather than delegating to `opts.registry?.hasAgentsYaml()`. When the registry is present (the normal server path) it already has `projectRoot` and the same logic. The double-check is consistent but slightly redundant and adds a second filesystem probe. If agents.yaml is created or deleted between `registry.load()` and the PTY WebSocket connection (a race window that is practically negligible but theoretically possible), the guard and the registry could disagree.
**Fix**: Prefer `opts.registry?.hasAgentsYaml() ?? hasAgentsYaml(opts.cwd)` to use cached registry knowledge first and fall back to a direct probe only when no registry is passed. No functional issue in practice.

### Finding 3 (severity: minor)
**File**: vscode-extension/src/extension.ts:97–111 (`ensureTerminal`)
**Issue**: The guard added at line 165 (`autoLaunch && workspaceHasAgentsYaml(workspaceRoot)`) correctly blocks *eager* terminal creation. However, `ensureTerminal` is also called on every `pty.inject` message (line 174) without any `hasAgentsYaml` check. When a `pty.inject` arrives on a project without agents.yaml, `ensureTerminal` creates a VS Code terminal and injects a `claude --session-id <uuid>` startup line from `resolveInjectedStartup`. This contradicts the intent stated in the proposal ("users can still open the terminal manually via … manual affordance") but specifically affects pty.inject-triggered scenarios. In practice, `pty.inject` is only sent when the user explicitly interacts with the dashboard terminal, so this is a pre-existing behavior path not altered by this change, and it's borderline whether guarding it belongs in scope.
**Fix**: If the intent is "no claude auto-launch in any code path when agents.yaml is absent," wrap the `ensureTerminal` call in `pty.inject` handler with `workspaceHasAgentsYaml` too, or strip the startup injection from `resolveInjectedStartup` when agents.yaml is absent. Otherwise, document the distinction clearly. Not a regression introduced by this change.

### Finding 4 (severity: info)
**File**: web/src/pages/Settings.tsx:22
**Issue**: `s.state?.hasAgentsYaml ?? true` defaults to `true` when state has not yet loaded. This is the correct safe default (no false-positive banner on initial render), and it matches the intent. Just noting it is correct as written.
**Fix**: No action needed.

### Finding 5 (severity: info)
**File**: server/agents/registry.ts:487–494
**Issue**: `hasAgentsYaml` uses `existsSync` then `statSync`. `existsSync` follows symlinks; `statSync` also follows symlinks. A dangling symlink (points to a non-existent target) will cause `existsSync` to return false (because the target does not exist), so the function returns false — which is the correct behavior. The test suite covers symlink-to-dir and symlink-to-file but not dangling symlinks. The existing logic handles the case correctly by accident (existsSync returning false), but a test would make this explicit.
**Fix**: Add a test case for a dangling symlink. Low priority — the behavior is correct.

## Verdict

pass — no blocking bugs. The guard fires in the correct code path (`attachPtyToSocket` and VS Code eager activation), `hasAgentsYaml` correctly rejects directories and symlinks-to-directories via `statSync`, both branches of `scanWorkspace` propagate the field, TypeScript typechecks cleanly, and all 25 tests pass. The minor findings (session-id side-effect before guard, redundant filesystem probe, pty.inject lazy path not guarded) are either harmless or out of scope for this change.
