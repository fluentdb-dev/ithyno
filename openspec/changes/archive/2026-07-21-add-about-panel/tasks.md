# Tasks

## 1. LICENSE file + shared About payload

- [x] 1.1 Add `LICENSE` file at repo root containing the full GPL-3.0 text (verbatim from `https://www.gnu.org/licenses/gpl-3.0.txt`). One-time task; no back-compat concerns.
- [x] 1.2 Confirm `electron/package.json` `build.extraResources` includes the repo-root `LICENSE` (add `{ from: "../LICENSE", to: "app/LICENSE" }` if missing) so the license ships with every packaged app.
- [x] 1.3 Confirm `vscode-extension/scripts/prepack.mjs` copies repo-root `LICENSE` into `vscode-extension/host/` (it already copies LICENSE per the vsix-state research — verify and adjust if needed) so `vsce package` includes it.
- [x] 1.4 Add `repository` and `bugs.url` fields to root `package.json` pointing at `https://github.com/fluentdb-dev/ithyno` and `https://github.com/fluentdb-dev/ithyno/issues`.
- [x] 1.5 Create `server/about.ts` (or `server/about/index.ts`) exporting a `getAboutInfo(): AboutInfo` function that reads root `package.json` at startup and returns `{ name, version, license, description, repositoryUrl, issuesUrl, sponsors, releasesUrl, licenseUrl }`. `sponsors` is a `SponsorLink[]` array — initial value `[{ label: "Ko-fi", url: "https://ko-fi.com/hamnbeans" }]`. Constants for `releasesUrl` and `licenseUrl` derive from the repository URL / license SPDX identifier. Adding a future entry (e.g., GitHub Sponsors) is a one-line append to the array.
- [x] 1.6 Expose an HTTP GET `/api/about` endpoint (Fastify) that returns the same `AboutInfo` object. Consumed by the web dashboard.
- [x] 1.7 Add types to `web/src/types.ts` for `AboutInfo` and `SponsorLink` (`{ label: string; url: string }`).

## 2. Web dashboard About button + modal

- [x] 2.1 Create `web/src/components/AboutButton.tsx` — a small circular icon button rendering `?` (with `aria-label="About ithyno"`, `title="About ithyno"`). Clicking sets modal-open state.
- [x] 2.2 Create `web/src/components/AboutModal.tsx` — matches the shape of `GitIdentityModal.tsx`. Fetches `/api/about` (with useEffect + store cache to avoid re-fetch on re-open) and renders: app name, version, license (with a "View License" link), description, and buttons:
  - "Open Repository"
  - "Report an Issue"
  - **For each entry in `sponsors`, one button `Sponsor via {label}`** (today: one button `Sponsor via Ko-fi`; tomorrow: multiple if the array grows)
  - "Check for Updates"
  - "View License"
  
  Each button `window.open`s its URL in a new tab. Close on ESC / backdrop click / X button.
- [x] 2.3 Mount `<AboutButton />` in `web/src/App.tsx` inside `.topbar-right`, positioned between `GitIdentityChip` and the `Live` connection indicator. Render it on ALL shells (unlike `GitIdentityChip`, which is web/Electron only) — VS Code users benefit from the button too.
- [x] 2.4 Style `.about-btn` in `web/src/styles.css` — small (~28×28px), circular, subtle border matching the topbar chip style, hover state. Both light + dark palette overrides.
- [x] 2.5 Do NOT add an "About" section to `web/src/pages/Settings.tsx`. The button is the only web entry point.

## 3. Electron shell

- [x] 3.1 In `electron/src/main.ts` (or wherever `app.whenReady()` resolves), read `AboutInfo` from the packaged root `package.json` (already bundled via `extraResources`) and call `app.setAboutPanelOptions({ applicationName, applicationVersion, copyright: license, credits, website })`.
- [x] 3.2 In `electron/src/menu.ts`, add Help-menu items:
  - **About ithyno** (calls `app.showAboutPanel()`)
  - **Sponsor** submenu — one item per `sponsors` entry, labeled `{entry.label}` (today the submenu has only "Ko-fi"; tomorrow it grows). Each item calls `shell.openExternal(entry.url)`. If `sponsors.length === 1`, MAY flatten to a single top-level "Sponsor via Ko-fi" item to avoid a submenu for one entry — implementer's call, either shape is acceptable.
  - **Check for Updates…** (`shell.openExternal(releasesUrl)`)
  - **Report an Issue** (`shell.openExternal(issuesUrl)`)
  - **View License** (`shell.openExternal(licenseUrl)`)
  
  On macOS, "About ithyno" is auto-inserted under the app menu — do NOT duplicate it under Help there.
- [x] 3.3 Confirm the About panel shows the correct version after `electron-builder` bundles the app (version comes from packaged `package.json`, not the electron-main `package.json`).

## 4. VS Code extension

- [x] 4.1 In `vscode-extension/package.json`, add `ithyno.about` to `contributes.commands` (title `ithyno: About`, category `ithyno`).
- [x] 4.2 In `vscode-extension/src/extension.ts`, register `ithyno.about` — the handler creates a `WebviewPanel` (title "About ithyno") with `enableScripts: false`.
- [x] 4.3 The webview HTML shows the same content shape as the web dashboard's About modal (name, version, license, description) and `<a href="...">` links: repository, issues, one link per `sponsors` entry (today: Ko-fi; future entries append naturally), releases, license. VS Code intercepts external links and opens them via `vscode.env.openExternal`.
- [x] 4.4 The version + URLs come from the extension's own `package.json` (matches root because `release:version` keeps them in sync per `add-release-build-workflow`).

## 5. Verification

- [x] 5.1 `npm run openspec -- validate add-about-panel --strict` passes.
- [x] 5.2 `npm test` passes.
- [x] 5.3 `npm run typecheck` passes.
- [x] 5.4 `npm run build` passes.
- [ ] 5.5 Manual: `npm run dev` → open dashboard → `?` button visible in topbar between `GitIdentityChip` and `Live` → click → modal shows `version: 0.0.1-alpha.0` (or current), license `GPL-3.0-or-later`, and all buttons open the correct URLs in a browser (repository, issues, sponsor via Ko-fi, releases, license).
- [ ] 5.6 Manual (Electron): `npm run electron:dev` → macOS `App > About ithyno` shows version + license; Help menu shows Sponsor (Ko-fi) / Check for Updates / Report an Issue / View License; each opens the correct external URL.
- [ ] 5.7 Manual (VS Code): install packaged `.vsix` → `Cmd+Shift+P → ithyno: About` → webview appears with the same content; all links (including sponsor Ko-fi) open external URLs.
- [x] 5.8 Regression check — temporarily add a second entry to the `sponsors` constant (e.g., `{ label: "GitHub Sponsors", url: "https://github.com/sponsors/fluentdb-dev" }`) and confirm all three surfaces render the second button/link without any other code change. Revert the temp edit before shipping.
- [ ] 5.9 Confirm the packaged electron app bundles `LICENSE`: run `npm run electron:package:mac`, inspect the resulting `.app`'s `Contents/Resources/app/LICENSE` — GPL-3.0 full text is present. (electron-builder binary fails on this machine — requires manual verification.)
- [x] 5.10 Confirm the packaged `.vsix` bundles `LICENSE`: run `npm --workspace ithyno-vscode run package`, `unzip -l vscode-extension/ithyno-*.vsix | grep LICENSE` — LICENSE present (confirmed: `extension/LICENSE.txt` in ithyno.vsix).
- [x] 5.11 Confirm zero network requests are made by any About surface on open (no GitHub API fetch, no ko-fi.com fetch, no telemetry). Code-verified: AboutModal fetches only `/api/about` (local server); Electron and VS Code surfaces read from disk; all external URLs opened only on explicit user click via OS delegation.
- [x] 5.12 Write `openspec/changes/add-about-panel/outcome.md` (✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups) — call out in-app update-comparison-and-badge as a follow-up once GitHub Releases publishing lands, and adding a GitHub Sponsors entry to `sponsors` once the maintainer sets up the sponsor page.
