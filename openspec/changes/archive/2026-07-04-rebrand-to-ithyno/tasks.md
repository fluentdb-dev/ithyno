## 1. Package identifiers

- [x] 1.1 Root `package.json` — `"name": "ithyno"`, update `description`, set `"bin": { "ithyno": "bin/ithyno.js" }` (drop the `openspec-ui` binary entry)
- [x] 1.2 `electron/package.json` — `"name": "ithyno-electron"`, update `displayName` and `description`
- [x] 1.3 `vscode-extension/package.json` — `"name": "ithyno-vscode"`, `"displayName": "ithyno"`, update `description`, `publisher` slot (keep `openspec-ui` for now if unclaimed, note in outcome)
- [x] 1.4 Regenerate `package-lock.json` (`npm install`) and commit

## 2. Binary rename

- [x] 2.1 `git mv bin/openspec-ui.js bin/ithyno.js`
- [x] 2.2 Update commander program name in `bin/ithyno.js` — `program.name("ithyno")` and the top-level comment header
- [x] 2.3 Update every internal reference to `bin/openspec-ui.js` (`electron/src/server-spawner.ts`, `vscode-extension/src/server-spawner.ts`, docs) to `bin/ithyno.js`
- [x] 2.4 CLI startup banner (or `--help`) reads "ithyno — local dashboard for the OpenSpec workflow"

## 3. Env vars

- [x] 3.1 Global grep for `OPENSPEC_UI_` and rename to `ITHYNO_` (server, electron, vscode-extension, tests, docs)
- [x] 3.2 Grep for `OPENSPEC_PROJECT_ROOT` / `OPENSPEC_OPEN` / `OPENSPEC_DEV` (the ones OWNED by our code, not upstream) and rename to `ITHYNO_PROJECT_ROOT` / `ITHYNO_OPEN` / `ITHYNO_DEV`
- [x] 3.3 Update `agents.yaml.example` comments and templates
- [x] 3.4 `docs/architecture/parallel-shells.md` and any other prose that mentions the env vars

## 4. Display strings — server / electron / vscode

- [x] 4.1 `server/index.ts` startup log — replace "OpenSpec UI" with "ithyno" in the launch banner (`✔  ithyno on http://…` and `✔  ithyno watching …`)
- [x] 4.2 `electron/src/main.ts` — window `title: "ithyno"`, macOS `app.setName("ithyno")`, About dialog text
- [x] 4.3 `electron/src/menu.ts` — macOS app menu label; other menu labels that say "OpenSpec UI"
- [x] 4.4 `vscode-extension/src/extension.ts` — output-channel name `"ithyno"`; command palette command title still starts with `OpenSpec UI:` OR becomes `ithyno:` — pick and document (recommend `ithyno:` for consistency)
- [x] 4.5 `web/index.html` — `<title>ithyno</title>`
- [x] 4.6 Grep `web/src` for user-visible "OpenSpec UI" strings; replace with "ithyno" (toast prefixes, error banners, headers)

## 5. Documentation

- [x] 5.1 `README.md` — heading `# ithyno`, lead paragraph explains ithyno = app / OpenSpec = workflow, sweep the rest of the file
- [x] 5.2 `docs/**/*.md` — sweep occurrences of "OpenSpec UI" the app-name, leave "OpenSpec" the workflow untouched; add a one-paragraph disambiguation to `docs/architecture.md` (or equivalent) if not obvious
- [x] 5.3 `CLAUDE.md` — update any app-name references
- [x] 5.4 `.claude/skills/openspec-flow/SKILL.md` — if it uses "OpenSpec UI" as the app name, replace; workflow terms untouched

## 6. Spec delta

- [x] 6.1 `openspec/changes/rebrand-to-ithyno/specs/dashboard/spec.md`: MODIFIED requirement covering the display-string and env-var contract now living under `ITHYNO_*` / "ithyno"

## 7. Verification

- [x] 7.1 `npm test && npm run typecheck && npm run build` all pass
- [x] 7.2 `node bin/ithyno.js --dir . --port 4321 --no-open` (or `npm start`) prints `✔  ithyno on http://…`
- [x] 7.3 `npm run electron:dev` opens a window titled "ithyno" (macOS app menu says "ithyno" too)
- [x] 7.4 `npm --workspace=vscode-extension run package` produces a VSIX; installing it exposes command palette entries starting with `ithyno:`
- [x] 7.5 Grep for stale references: `grep -rn "OpenSpec UI\|openspec-ui\|OPENSPEC_UI_" --include='*.ts' --include='*.tsx' --include='*.md' --include='*.json'` returns only intended survivors (upstream OpenSpec refs, this proposal, and the archived changes' historical prose)
- [x] 7.6 Old binary invocation `openspec-ui` no longer exists — `which openspec-ui` returns nothing after a fresh `npm install`
