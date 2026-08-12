# Outcome

## ✅ Worked

- **Same-window swap eliminates the "window closes → window opens"
  flicker.** After the pivot, the main BrowserWindow is created
  ONCE and its content transitions via `loadFile(welcome.html)` →
  `loadURL(spawn.url)`. Window bounds persist across the swap, the
  menu bar is set once, and Cmd+Q / Cmd+W behaviour is uniform. The
  original v1 design (separate welcome BrowserWindow, then create a
  second main BrowserWindow, then close welcome) has all of these
  concerns as separate coordination problems; v2 makes them
  non-problems by construction.
- **Unified preload made the swap trivial.** `contextBridge`
  exposes `ithynoWelcome` alongside `openspecUI` / `ithyno` from the
  same preload script. Each page (welcome.html, main React app)
  reads only the globals it needs; the other stays unused. This is
  what unlocks "one BrowserWindow, two pages" — preload is fixed at
  construction time in Electron, so a single unified preload was the
  only path.
- **Palette re-use via CSS variables kept the redesign small.**
  Copied the same `--bg-page` / `--bg-panel` / `--border` /
  `--fg-primary` / `--fg-muted` / `--accent` variable names from
  `web/src/styles.css` into welcome.html's `<style>` block, gated by
  `:root[data-theme="dark|light"]`. Welcome now visually matches the
  main app in either theme without any React or CSS-module
  infrastructure.
- **About-panel pattern (muted-label + raw value) fits welcome
  naturally.** Removing the `"v" + version` / `"License: " + license`
  string concatenation and rendering `<span class="muted">Version</span>
  <code>0.0.1-alpha.0</code>` instead removed the double-prefixing
  and put welcome in visual alignment with AboutModal.

## ⚠️ Surprises

- **First cut was a separate BrowserWindow — the wrong architecture.**
  I followed the `add-new-project-onboarding-window` pattern
  (separate window with its own preload + IPC) without checking
  whether it fit the welcome case. Onboarding is a wizard flow with
  its own life; welcome is "the app started but no project is
  selected yet", which is a natural state of the main window. That
  mistake cost one impl commit, one code review round, and this
  outcome-and-rework pass — but the pivot itself was cheap once the
  right architecture was named.
- **`prefers-color-scheme` is the ONLY signal welcome.html can
  read.** The main app's theme preference lives in
  `localStorage["ithyno.theme"]` under the
  `http://localhost:<port>` origin. welcome.html loads from
  `file://`, a different origin, so localStorage is not shared.
  Adding IPC to expose the preference from Electron main would
  require reading (or duplicating) what today lives only in the
  renderer. `prefers-color-scheme` is correct for the welcome case
  anyway — welcome appears only when no project is loaded, i.e. the
  user has not yet had a chance to override the OS default.
- **The auto-mode classifier blocked `git reset --hard HEAD~1`**
  when I tried to squash the v1 (separate window) impl into the v2
  (same-window swap) impl. Landing two impl commits (`impl v1
  separate window` → `impl v2 same-window swap pivot`) is the
  correct outcome given the constraint — if the operator wants a
  clean single-impl history they can squash locally with
  interactive rebase later.
- **`prefers-color-scheme` inline script needed `'unsafe-inline'`
  in `script-src` for CSP.** The pre-paint theme resolver has to
  run before body paints (to avoid FOUC), so it can't be
  external-loaded. Added `'unsafe-inline'` to the meta CSP. This
  is the same trade-off `web/index.html` makes for its inline FOUC
  guard.

## 🔁 Differently

- **Would have named the architecture (same-window swap vs separate
  window) in the proposal from the start.** The v1 proposal said
  "new welcome BrowserWindow" without justifying WHY it needed to
  be separate. That framing invited the wrong implementation.
  Naming the architecture explicitly ("same-window swap: welcome
  and main share one BrowserWindow, its URL swaps in place") is
  what surfaced the design problem in code review.
- **Would have written the IPC handler tests up front if the
  harness were less painful.** Testing Electron main-process code
  with a mocked `ipcMain` / `BrowserWindow` requires nontrivial
  fake-module scaffolding, and the ROI is low compared to a manual
  launch. The existing electron-side code follows the same
  "verified by manual launch, not unit tests" pattern (see
  `add-electron-shell` / `add-new-project-onboarding-window`), so
  this change fits the norm.

## 🌱 Follow-ups

- **New Project button in the welcome view.** Deferred per user
  direction ("Open Folder is enough — NoProjectDecisionPanel
  handles the initialize case"). If friction shows up (users don't
  discover the initialize button post-selection), add a dedicated
  New Project entry that routes straight to
  `/onboarding?target=<picked>`.
- **Recent list pruning at startup, not just on click.** Currently
  a stale recent entry survives until the user actually clicks it
  in the welcome view. A one-time sweep on welcome-view load —
  `store.getRecent().filter(isDirectory)` + write back the pruned
  list — would keep the visible list honest without waiting for
  the user to hit a dead entry.
- **Actual manual test on packaged binary.** The main-process code
  matches the onboarding pattern and typechecks cleanly, but only a
  packaged run confirms electron-builder ships `welcome.html`
  correctly under `resources/app/electron/welcome.html`.
- **Reading the app's stored `theme` preference for welcome.html.**
  Currently `prefers-color-scheme` only. If a user has set a hard
  override in the app (light on a dark OS, or vice versa) and then
  the saved project becomes stale, they'll briefly see welcome in
  the OS palette before opening a new project. Ambient cost is
  small; fix path is IPC handler that reads a shared config file.
