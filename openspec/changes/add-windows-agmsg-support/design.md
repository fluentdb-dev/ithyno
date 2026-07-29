## Context

Discovered and hand-verified this session (Windows dogfooding pass):
`electron/src/agmsg-installer.ts` unconditionally skips Windows.
`vendor/agmsg`'s own README lists its only real requirements as
`bash` + `sqlite3`. Both are already satisfiable on a typical ithyno
Windows dev machine — Git for Windows (a de facto prerequisite for
this git-centric project) bundles a real MSYS2 `bash.exe`, and a
manual test installing + joining a team + sending a message + reading
it back via `api.sh get ... messages` worked end-to-end under that
Git Bash, no WSL2 involved.

## Goals / Non-Goals

**Goals:**
- Windows gets the same install-prompt UX as macOS/Linux, gated on a
  reliable Git Bash + sqlite3 presence check.
- Core messaging (`join`/`send`/`api.sh get`) works identically to
  macOS/Linux once installed.
- Correctly avoid the WSL launcher `bash.exe` stubs — a naive PATH
  search for `bash` is actively wrong on Windows, not just
  incomplete.

**Non-Goals:**
- tmux `delivery.sh` monitor-mode integration. Not tested this
  session — a separate change once verified.
- Bundling a portable `sqlite3.exe`. v1 requires the user to already
  have one on PATH.
- Any WSL2 integration path.

## Decisions

### Resolve Git Bash from `git`, not from a PATH search for `bash`

Windows ships two `bash.exe` stubs that are NOT Git Bash:
`C:\Windows\System32\bash.exe` and the WindowsApps execution-alias
`bash.exe`. Both are WSL launchers — running them either starts WSL
(if installed) or prompts to install it from the Store. A bare
`where bash` / PATH search can resolve to either of these ahead of
Git's own `usr\bin\bash.exe`, depending on PATH ordering, which is
exactly the kind of environment-dependent flakiness this project has
already been bitten by twice this session (`hasTmux()`'s `which`
call, `defaultShell()`'s bare `pwsh.exe` assumption).

The fix, matching the existing `commandExistsOnPath()` pattern in
`server/sync/pty.ts`: locate `git.exe` first (already a hard
project dependency), then derive `bash.exe` relative to that
installation's root — `<gitRoot>\bin\bash.exe`. This is the same
`bash.exe` Git for Windows ships and is guaranteed to be real MSYS2
bash, never a WSL stub.

### sqlite3: detect, don't bundle (yet)

Bundling a portable `sqlite3.exe` (fetching a static build, adding it
to `vendor/`, wiring it into `electron-builder`'s `extraResources`,
keeping it updated) is real packaging work with its own maintenance
burden. For v1, detect via the same `where <cmd>` pattern already
used for `pwsh.exe`/`tmux`, and skip installation with a clear log
message when absent — same shape as the existing tmux-missing
fallback banner. Revisit bundling only if "no sqlite3 on PATH" turns
out to be the common case in practice, not the exception.

### Install step needs no `bash.exe` invocation at all

Re-checked against the actual current code: the existing macOS/Linux
`ensureAgmsgInstalled()` doesn't run `install.sh` — it's a plain
Node `cpSync` recursive copy of the vendored tree plus a best-effort
`chmodShellScripts()` (already wrapped in try/catch, since chmod bits
aren't meaningful everywhere). That works unmodified on Windows: no
shell involved in a file copy, and `chmodSync` on NTFS is a harmless
no-op the code already tolerates. So Windows doesn't need a separate
install code path — once Git Bash + sqlite3 are confirmed present
(as a *capability gate*, proving the resulting scripts will actually
run later), it falls through into the exact same shared install
logic already used for macOS/Linux. Git Bash resolution exists purely
to gate the prompt correctly, not to invoke anything during install
itself — matching the finding in `proposal.md` that ithyno's own code
never shells out to agmsg's messaging scripts directly either (that
happens inside the live Manager agent's own Bash tool later).

## Alternatives considered

- **WSL2 as the runtime.** Rejected for the reasons already discussed
  with the user: heavy onboarding (feature enablement, possible
  reboot, distro download), and a separate filesystem/process
  boundary that this project's own Windows verification doc already
  warns causes chokidar watch failures when mixed with native Windows
  paths. Git Bash needs zero additional onboarding for anyone who
  already has Git for Windows, which ithyno assumes.
- **Bare `PATH` search for `bash`.** Rejected — actively resolves to
  a WSL stub on a stock Windows install with WSL enabled, see
  Decisions above.
- **Bundle a portable sqlite3.exe now.** Deferred, not rejected — see
  Decisions above. Revisit if PATH-detection failure turns out to be
  common.
