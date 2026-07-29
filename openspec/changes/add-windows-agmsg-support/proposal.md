---
tags: [feature/electron, area/electron, area/server]
---

## Why

`electron/src/agmsg-installer.ts` currently skips Windows outright:

```ts
// Windows: tmux/agmsg pipeline isn't supported. Skip the prompt.
if (platform() === 'win32') return;
```

Verified by hand this session: the vendored `fujibee/agmsg` tool
(`vendor/agmsg`) only needs `bash` + `sqlite3` (per its own README),
and both are available on a typical Windows dev machine that already
has Git for Windows installed — which ithyno already assumes, since
the whole project is git-centric. Running `vendor/agmsg/install.sh`
directly under Git Bash's `bash.exe` (no WSL2) succeeded with zero
errors, and a manual `join` → `send` → `api.sh get ... messages`
round-trip between two test agents worked end-to-end.

The blanket Windows skip is therefore broader than necessary. This
change replaces it with a real (if narrower-scope) Windows path:
installer + core messaging (`join`/`send`/`api.sh get`). The
tmux `delivery.sh` monitor-mode integration (auto-invoking Claude
Code's Monitor tool from a live tmux pane) is explicitly deferred —
untested this session, and a materially different risk profile from
the core scripts already proven to work.

## What Changes

### Git Bash detection (not "any bash on PATH")

`C:\Windows\System32\bash.exe` and the WindowsApps alias `bash.exe`
are WSL launcher stubs, not real bash — searching PATH for a bare
`bash` command can resolve to either of those instead of Git Bash's
`usr\bin\bash.exe`, silently doing the wrong thing (prompting to
install WSL, or worse, actually delegating into a WSL environment
ithyno never intended to touch). Resolve Git Bash by locating the
`git` executable already on PATH (`where git` /
`git --exec-path`) and deriving `bash.exe` relative to that
installation's root (`<gitRoot>\bin\bash.exe`), the same install
that owns `git.exe` — never a bare PATH search for `bash`.

### sqlite3 detection

Check for `sqlite3` on PATH the same way `hasTmux()` does
(`where sqlite3`). If absent, `ensureAgmsgInstalled()` skips the
install prompt and logs a message pointing at where to get it —
same pattern as the existing tmux-missing fallback banner in
`ptyStartup()`. No bundling of a portable `sqlite3.exe` in this
change (see Out of scope).

### `ensureAgmsgInstalled()` on win32

- Replace the unconditional `if (platform() === 'win32') return;`
  with: resolve Git Bash + sqlite3; if either is missing, skip
  silently (log only, same as today's "vendored tree not found"
  path) rather than showing an install prompt for a broken setup.
- If both are present, run the same install flow as macOS/Linux, but
  invoke `install.sh` via the resolved `bash.exe` (Windows can't
  execute a `.sh` file directly — no shebang-based dispatch), same
  as how `defaultShell()`/`hasTmux()` already had to special-case
  Windows invocation elsewhere in this codebase.

### Messaging dispatch: no code change needed

Audited: ithyno's own server/Electron code never shells out to
agmsg's messaging scripts directly. `spawn-options-writer.ts` only
reads/writes `~/.agmsg/config/spawn_options.yaml` (plain fs). The
actual `join.sh`/`send.sh`/`api.sh` calls happen inside the live
Manager agent's own Claude Code session, via *its own* Bash tool —
which already resolves Git Bash correctly on Windows. Once installed,
messaging works with zero additional ithyno-side dispatch code.

## Capabilities

### Modified Capabilities

- `dashboard`: the "Electron First-Launch Auto-Installs Agmsg"
  requirement's "Windows launch skips the install step" scenario
  (landed, `openspec/specs/dashboard/spec.md`) is replaced — Windows
  now runs the same install-prompt flow as macOS/Linux, gated on
  Git Bash + sqlite3 detection instead of an unconditional platform
  skip.

## Impact

- `electron/src/agmsg-installer.ts` — Git Bash + sqlite3 detection,
  win32 branch instead of early return, `bash.exe <script>` invocation
  style for install
- `server/agents/spawn-options-writer.ts` (and any other call site
  that shells out to agmsg scripts) — Windows invocation via resolved
  Git Bash
- Likely a small shared `resolveGitBash()` helper, since both the
  installer (Electron main process) and any server-side agmsg dispatch
  need the same resolution logic

## Out of scope

- tmux `delivery.sh` monitor-mode integration (auto-launch Monitor
  tool from a tmux pane) — unverified this session; separate change
  once someone actually tests it end-to-end on Windows.
- Bundling a portable `sqlite3.exe` — v1 requires the user to have one
  on PATH already (document it in the Windows verification handout
  instead of solving distribution here).
- WSL2 as an alternative backend — Git Bash covers the need with far
  less onboarding friction; not pursuing WSL2 integration unless Git
  Bash turns out to be insufficient for the deferred monitor-mode work.
