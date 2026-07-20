---
tags: [ui, electron, vscode-extension, dashboard, donations, about]
execution: worktree
---

## Why

ithyno has no "About" surface today. A user who wants to know what
version they're running, what license the project ships under, where
to file bugs, how to sponsor development, or whether a newer version
exists has no in-app path — they have to leave the app, guess the
repo URL, and dig around GitHub. This gets worse the moment the
release-build workflow (`add-release-build-workflow`) starts stamping
versions into artifact filenames: users will see `ithyno-0.0.1-alpha.0`
and have nothing in the app that echoes it back.

Adding a small, consistent About panel closes three gaps in one move:
identity (what am I running), attribution (license + repo), and
sustainability (donation link + update path). Placement matches
platform convention on each surface: an `app.setAboutPanelOptions` +
"About ithyno" menu item on Electron, a `ithyno.about` command opening
a webview on VS Code, and a **`?` icon button in the topbar** on the
web dashboard — sitting next to the `Live` connection indicator so
it's one click away from anywhere in the app, mirroring the existing
`GitIdentityChip` pattern (chip → modal). No Settings-page detour.

The one deliberately-limited piece is **update notification**. A real
in-app "an update is available" badge needs a stable URL that returns
the latest published version — which requires GitHub Releases (or
another release feed) to actually publish. `add-release-build-workflow`
explicitly excludes Release publishing, so this change ships a
**"Check for updates"** button that opens
`https://github.com/fluentdb-dev/ithyno/releases/latest` in the user's
default browser — honest to today's infrastructure, easy to upgrade
to in-app comparison once release publishing lands (tracked as a
follow-up).

## What Changes

- **New `about-panel` capability** defining the shape of the About
  payload (version, license, repo URL, issues URL, `sponsors`
  array, releases URL, license URL) and the actions (Open Repo,
  Open Issues, Sponsor via each listed platform, Check for Updates,
  View License).
- **Add `LICENSE` file at repo root** with the full GPL-3.0 text
  (fulfilling the GPL distribution obligation). Bundled into electron
  and vsix packages via existing packaging paths so the licence text
  travels with every distribution.
- **Shared About payload source** at `server/about.ts` (or equivalent)
  that reads `package.json` for version + license + repository URL,
  and exports a single `AboutInfo` object consumed by all three
  surfaces. Ensures version drift between UI and manifest is
  impossible.
- **Web dashboard**: add an `AboutButton` component (small `?` icon
  button) mounted in `App.tsx`'s `.topbar-right`, adjacent to the
  `Live` connection indicator. Clicking it opens an `AboutModal`
  (following the `GitIdentityChip → GitIdentityModal` pattern) that
  shows `AboutInfo` and the four external-link buttons. NOT rendered
  in the Settings page.
- **Electron shell**:
  - Call `app.setAboutPanelOptions({...})` at startup with `AboutInfo`
    so the native "About ithyno" menu item (auto-added under the app
    menu on macOS, and via the Help menu on Windows/Linux) shows
    version + license + copyright.
  - Add a **"Sponsor ithyno"** and **"Check for Updates…"** menu item
    under Help — both open their respective URLs via `shell.openExternal`.
- **VS Code extension**:
  - Register `ithyno.about` command in `package.json.contributes.commands`.
  - Command opens a small webview panel rendering `AboutInfo` +
    buttons; buttons use `vscode.env.openExternal(vscode.Uri.parse(...))`.
- **License URL** defaults to
  `https://www.gnu.org/licenses/gpl-3.0.html` (the canonical GPL-3.0
  page). The "View License" button opens this URL externally, giving
  users the full license text without embedding it in the modal.
- **Sponsors list** is modeled as an array `sponsors: SponsorLink[]`
  where each entry is `{label: string, url: string}`. The initial
  entry is `{label: "Ko-fi", url: "https://ko-fi.com/hamnbeans"}`.
  The array form leaves room to append a GitHub Sponsors entry (or
  any additional platform) later as a one-line edit to the
  constant, with zero schema churn on the client. The button opens
  each URL unconditionally via the OS default browser; ithyno
  itself does not fetch anything from those hosts.
- **Repository / issues URLs** added to root `package.json` under
  `repository` and `bugs.url` so `AboutInfo` derives them from the
  manifest and doesn't hardcode strings.

## Success

- The web dashboard's topbar-right shows the order:
  `GitIdentityChip` (when applicable) → `AboutButton (?)` → `Live`
  indicator. Clicking `?` opens the modal without navigating away.
- Opening the About surface on each of the three shells shows the
  same `version` field, matching `package.json.version` byte-for-byte.
- Clicking "Open Repository" opens `https://github.com/fluentdb-dev/ithyno`
  in the user's default browser (or the VS Code / Electron equivalent).
- Clicking the sponsor entry labeled "Ko-fi" opens
  `https://ko-fi.com/hamnbeans`. Adding a second entry to the
  `sponsors` array (e.g., a future GitHub Sponsors entry) renders
  an additional button/menu item without any other client-side
  code change.
- Clicking "Check for Updates" opens
  `https://github.com/fluentdb-dev/ithyno/releases/latest`.
- Clicking "View License" opens
  `https://www.gnu.org/licenses/gpl-3.0.html`.
- A `LICENSE` file containing the full GPL-3.0 text exists at repo
  root and is present in the bundled electron app (`extraResources`
  copies it into `app/`) and in the packaged `.vsix` (staged into
  `vscode-extension/host/` by `prepack.mjs`).
- No secret or telemetry request is issued by the About surface (no
  fetch to GitHub API, no analytics ping, no auto-check on launch).
- On macOS, the standard `App > About ithyno` menu item shows the
  version and license from `AboutInfo` (via
  `app.setAboutPanelOptions`).
- On Windows/Linux Electron, the Help menu contains **About ithyno**,
  **Sponsor ithyno**, and **Check for Updates…** items.
- In VS Code, `Cmd+Shift+P → ithyno: About` opens a webview showing
  the same content.
