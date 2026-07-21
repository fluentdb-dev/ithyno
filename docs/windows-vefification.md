# Windows verification handout

Hand this to a Windows tester (or use it yourself on a Windows box)
to verify the pieces that don't reproduce on macOS: PTY / ConPTY,
the `titleBarOverlay` window chrome, and packaged-installer launch.

## 0. Prerequisites

- **Windows 10 build 1809 or later** (required for ConPTY).
- **Node.js 20.x or 22.x LTS** (`node --version`). Any Node without
  a `node-pty` prebuild will fall back to compilation — see §6.1.
- **Git for Windows** (`git --version`).
- **VS Code, JetBrains, or any editor of choice** — not required
  by ithyno, but useful when iterating on Kanban tasks.
- Optional: **[Claude Code](https://docs.claude.com/en/docs/claude-code/setup)**
  installed and on `PATH`. Not required for the smoke test, but the
  embedded-terminal PTY check exercises it.
- Optional: **PowerShell 7** (`pwsh.exe` on `PATH`). ithyno prefers
  it over `powershell.exe` when available.

Run in **PowerShell 7** (or `cmd.exe`) — WSL is out of scope for
this handout. If you must test WSL, run both the server and Claude
Code inside WSL together; do NOT mix WSL + Windows paths (chokidar
watching breaks at the boundary).

## 1. Clone + install + build

```powershell
git clone git@github.com-fluentdb:fluentdb-dev/ithyno C:\src\ithyno
cd C:\src\ithyno
npm install

# CRITICAL: build the web bundle before launching Electron.
# Electron always runs the server in production-static mode and
# serves web/dist/. Skipping this yields a "not found" JSON in the
# window because no index.html exists to serve.
npm run build
```

Expected: `npm install` finishes without native-build errors (see
§6.1 if it doesn't), and `npm run build` writes
`web\dist\index.html` and `web\dist\assets\*.{js,css}`.

## 2. Launch — dev mode

```powershell
npm run electron:dev
```

Expected in this order:

1. TypeScript compiles under `electron\out\`.
2. Electron opens a window titled "ithyno".
3. The dashboard renders. If it shows JSON `{"error":"not found"}`,
   go back to §1 and confirm `web\dist\index.html` exists.
4. The Kanban lists changes from `openspec\changes\`.

## 3. Launch — packaged installer

```powershell
npm run electron:package:win
```

- Output: `electron\dist\ithyno Setup <version>.exe` (NSIS installer).
- **Unsigned build** → SmartScreen will complain on first launch.
  Click "More info" → "Run anyway".
- After install, launch from the Start menu. Same dashboard should
  appear.

If you want signed output, set `CSC_LINK` and `CSC_KEY_PASSWORD`
env vars pointing at your `.pfx` and re-run the package step. See
`electron-builder` docs for details.

## 4. Window chrome — the Windows-specific check

The `add-electron-window-chrome` change on macOS uses
`titleBarStyle: 'hiddenInset'` (traffic lights). On Windows it
uses `titleBarStyle: 'hidden'` + `titleBarOverlay` — the OS draws
the minimize / maximize / close controls, and ithyno colors the
background under them.

Verify:

- [ ] **No default OS title bar strip** above the topbar. The
      #0f1115 dark surface should extend to the top edge of the
      window.
- [ ] The **minimize / maximize / close** buttons render at the
      top-right, painted with white symbols on the dark surface.
- [ ] **Dragging** the topbar (avoid the nav links and the Git
      identity chip on the right) moves the window. `titleBarOverlay`
      only draws the min/max/close buttons — the rest of the topbar
      is draggable because the renderer marks it with CSS
      `-webkit-app-region: drag` (this works on every platform, not
      just macOS). If the topbar is not draggable on Windows this is
      a bug. Report the exact area you tried to drag.
- [ ] **Double-click** on the drag area maximizes / restores. This
      is native Windows behavior over the overlay area.
- [ ] **Snap layouts** (hover the maximize button) shows Windows 11
      snap layouts if you're on Windows 11.

If the OS title bar strip DOES appear (a light bar above the ithyno
topbar), the `titleBarStyle: 'hidden'` option didn't take effect —
copy the console output from the Electron main process
(`View → Toggle Developer Tools → Console` and also the terminal
that started `npm run electron:dev`) and file that.

## 5. PTY / ConPTY — embedded terminal

The dashboard's terminal pane bridges a real Windows shell to
xterm.js in the browser via ConPTY.

Verify:

- [ ] Open any change from the Kanban → ChangeDetail renders.
- [ ] Terminal pane on the right shows a shell prompt. Default
      shell selection:
      1. `pwsh.exe` if on `PATH` (PowerShell 7)
      2. else `powershell.exe`
      3. override with env var `ITHYNO_SHELL=<path-to-shell>` before
         `npm run electron:dev` if you want a specific shell
- [ ] Basic commands work: `dir`, `Get-Date`, `Get-Location`.
- [ ] `git status` runs and shows repo state (validates git is on
      `PATH`).
- [ ] Type `claude --version` (if Claude Code installed). Should
      print the version — validates `claude` is on `PATH`.
- [ ] Resize the terminal pane by dragging its splitter. The
      shell's `COLUMNS` / `LINES` should track the resize (test
      with `Get-Host | Select-Object -ExpandProperty UI` and check
      `RawUI.WindowSize`).

If the terminal pane is missing entirely with a "Terminal
unavailable" note, the PTY module failed to load. Check the
Electron terminal output for an error mentioning
`@homebridge/node-pty-prebuilt-multiarch` — see §6.1.

## 6. Common failure modes

### 6.1 `npm install` compiles node-pty and fails

Symptom: install spends a minute on
`@homebridge/node-pty-prebuilt-multiarch` and errors with `gyp` /
`node-gyp` / MSVC messages. Root cause: no prebuild exists for your
exact Node version, so npm tries to compile from source and needs
Visual Studio Build Tools.

Fixes, in order of least effort:

1. **Use a Node version with prebuilts** — Node 20.x LTS or 22.x
   LTS are the safest.
2. **Install Visual Studio Build Tools** (Desktop development with
   C++ workload) + Python 3.x, then retry `npm install`.
3. **Disable the terminal** — omit node-pty entirely by editing
   your local `package.json` to remove
   `@homebridge/node-pty-prebuilt-multiarch` from `dependencies`
   before `npm install`. The dashboard degrades gracefully
   (`/api/health` returns `terminal.available: false`; the
   terminal pane hides).

### 6.2 `npm run electron:dev` shows JSON `{"error":"not found"}`

You skipped `npm run build`. See §1.

### 6.3 SmartScreen refuses the installer

Expected for unsigned builds. "More info" → "Run anyway". Or sign
the build (§3).

### 6.4 `claude` runs in the embedded terminal but the Kanban does not update

Chokidar file watching stopped tracking edits. Two known causes:

- WSL / Windows path mismatch — the server is watching one path
  space, `claude` is writing to another. Run BOTH in the same
  environment (both in WSL, or both native Windows).
- Long paths — Windows historically capped paths at 260 chars.
  If your project sits under a deep dir tree, move to
  `C:\src\<short-name>\` and retry.

### 6.5 Window opens but is invisible / off-screen

The saved `windowState` may point at a monitor that's no longer
attached. Delete `%APPDATA%\ithyno-electron\state.json` and
relaunch — the window will reset to a default position.

### 6.6 Terminal renders "??" / mojibake for non-ASCII output

Windows `pwsh.exe` defaults to UTF-8 in recent versions, but
`powershell.exe` and `cmd.exe` may not. Test with:

```powershell
chcp 65001
```

If that fixes it, the shell was in a non-UTF-8 code page. Not an
ithyno bug per se, but note the shell / OS locale when reporting.

## 7. What to send back

For any bug, include in the report:

1. **OS + build**: `winver` output (Windows 11 23H2, Windows 10
   22H2, etc.).
2. **Node version**: `node --version`.
3. **The exact command** that produced the failure.
4. **Terminal output** from the moment `npm run electron:dev`
   (or the packaged app) started, all the way through the failure.
5. **Electron main-process console** (`View → Toggle Developer
   Tools → Console`, filter to `main`).
6. **Screenshot** of the window state when the bug is visible.
7. **`web\dist\` presence check**: `dir web\dist\index.html` —
   yes / no.
8. **PTY availability**:
   `curl.exe http://localhost:<port>/api/health -H "X-CSRF-Token: <token>"`
   → note the `terminal.available` field. (Port + token appear in
   the Electron main-process console at boot.)

Section 4 (window chrome) and Section 5 (PTY) are the two
highest-value verification passes we cannot reproduce off Windows;
prioritize those if bandwidth is limited.
