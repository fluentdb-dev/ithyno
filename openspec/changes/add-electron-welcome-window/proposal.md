---
tags: [electron-shell, ux, welcome, onboarding, first-launch, about]
execution: worktree
---

## Why

Electron's first launch (no saved project, or the saved project no
longer exists) drops the user directly into a native OS "Select
folder" dialog with title `Select an OpenSpec project folder`. There
is no context ahead of it:

- No app identity — the dialog looks like any file picker on the OS.
- No explanation of why a folder is being asked for.
- No shortcut for the common cases (recent projects, "just show me
  the app").
- Cancel = the app quits silently, with no feedback.

The dialog itself is fine as a picker; the problem is that it's the
FIRST thing the user sees, with no framing. Every other IDE with a
similar workflow (VSCode, Cursor, Zed) uses a small welcome screen
between "the app started" and "the user picked a folder", showing
identity + recent + a single explicit action.

## What Changes

1. **New welcome BrowserWindow** — a small, standalone window (no
   server dependency) that opens on first launch instead of the
   native picker. Loaded from a static HTML file bundled with the
   Electron app.

2. **Content, sourced from the same `AboutConfig` the About panel
   already uses**:
   - App icon (`electron/build/icon.png` — same asset as the
     packaged dock/taskbar icon).
   - App name (`aboutConfig.name`).
   - Version (`aboutConfig.version`).
   - License line (`License: ${aboutConfig.license}`).
   - Short description (`aboutConfig.description` if present).
   - Recent projects list (from `ProjectStore.getRecent()`, up to
     the existing `RECENT_CAP`). Each entry is clickable → opens
     that project directly.
   - A single `Open Folder…` button → invokes the existing
     `pickProjectDialog()` → routes into `createWindowForProject()`.
   - Optional footer links: License / Repository (sourced from
     `aboutConfig.licenseUrl` / `repositoryUrl`) — opens via
     `shell.openExternal`.

3. **About-panel commonisation**: The welcome window and the native
   `showAboutPanel()` SHALL both consume `readAboutConfig()` as
   their single source of truth. No fields are duplicated in the
   welcome HTML; the preload injects the data at load time via IPC.

4. **First-launch flow change (main.ts `whenReady`)**:
   - If `store.getLastProject()` is a valid directory → open
     directly with `createWindowForProject()` (unchanged; keeps
     "reopen last project" semantics).
   - Otherwise → open the welcome window (instead of firing
     `pickProjectDialog()` unconditionally).
   - Cancelling the welcome window (closing it) quits the app —
     same terminal semantics as today, but with clear intent
     ("user closed the welcome" rather than "user cancelled a
     mysterious picker").

5. **New IPC channels** (welcome preload → main):
   - `welcome:get-about` → returns `AboutConfig`
   - `welcome:get-recent` → returns `ProjectStore.getRecent()`
   - `welcome:open-folder` → invokes `pickProjectDialog()`, on
     selection routes to `createWindowForProject()` and closes the
     welcome window
   - `welcome:open-recent` (path: string) → validates directory,
     opens or prunes stale entry via `removeFromRecent`
   - `welcome:open-external` (url: string) — safe subset for
     License / Repo links (`shell.openExternal` with URL allowlist)

6. **`Menu > File > Open Folder…` behaviour is unchanged** — the
   welcome window is only for the app-launch entry point. Once a
   project is open, `Cmd/Ctrl+O` still fires `pickProjectDialog()`
   the same way it did before.

## Non-goals

- **Welcome page for subsequent launches with a valid saved
  project.** The "reopen last project" auto-launch stays — Users
  who work in one project every day still see zero friction.
- **A `New Project…` button on the welcome page.** Per user
  direction: `Open Folder…` handles both cases (existing openspec
  folder OR fresh folder → NoProjectDecisionPanel decides after).
  A dedicated New Project entry can be added later if it becomes
  friction; for v1 the single-action UI is the goal.
- **Auto-open the last-focused project on activate (macOS dock
  click when no window)**. That flow already calls `ensureProject()`
  → welcome window naturally kicks in when needed. No new logic
  required.
- **Web-side (browser mode) welcome UI.** This change is
  Electron-only. Browser-mode users still land on
  `NoProjectDecisionPanel` when opening a non-openspec folder;
  their entry point differs.
- **A "Skip" / "Continue without a project" button.** The app
  requires a project to do anything meaningful; browsing without
  one is what `Open dashboard anyway` in `NoProjectDecisionPanel`
  already covers post-folder-selection.
- **Welcome window preference (do not show again)**. First-launch
  guard already exists via `store.getLastProject()`; a returning
  user with valid state never sees the welcome window. No
  preference toggle needed.

## Impact on existing capabilities

- **MODIFIED**: `Electron First-Launch Auto-Installs Agmsg`
  neighbourhood — the app's first-launch flow gains a welcome
  window ahead of `ensureProject`'s picker fallback. Neither
  the agmsg install prompt nor the picker themselves change; only
  when they trigger. (The agmsg install prompt is already gated
  post-project-open — no interaction with the welcome step.)
- **NEW** requirement: welcome window shape + content contract.
- **NEW** requirement: About-config single-source-of-truth
  guarantee (welcome + native about panel MUST use the same
  `readAboutConfig()` output).
- The existing `pickProjectDialog()` and `createWindowForProject()`
  functions are reused verbatim; no signature changes. Only their
  call site moves (from `ensureProject` inline to IPC handler).
