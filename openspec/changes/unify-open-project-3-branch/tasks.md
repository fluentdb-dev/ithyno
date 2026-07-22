# Tasks

## 1. Store + state field

- [ ] 1.1 In `web/src/store.ts`, add `browseMode: boolean` (initial `false`) and `setBrowseMode(v: boolean)` action.
- [ ] 1.2 Add types to `web/src/types.ts` for the new `/api/browse/*` responses (`MarkdownTreeNode[]`, `MarkdownContent`).

## 2. Decision panel component

- [ ] 2.1 In `web/src/App.tsx`, replace the current `state?.exists === false` empty-state block with a new `<NoProjectDecisionPanel />` component (extracted into `web/src/components/NoProjectDecisionPanel.tsx`).
- [ ] 2.2 The panel shows: heading "No OpenSpec project found in `<path>`", three primary buttons in a row (Initialize / Cancel / Browse), and — when the server reports `CLAUDE.md` exists at root — a small info line beneath the buttons.
- [ ] 2.3 Wire `Initialize openspec here` to `POST /api/init` with the current dir. On 2xx, refetch `/api/state`; on error, show a toast with the error message.
- [ ] 2.4 Wire `Cancel` — on Electron, invoke `Open Project…` again via the existing IPC bridge; on browser, show an empty helper telling the user to relaunch with `--dir <path>`.
- [ ] 2.5 Wire `Browse read-only` — calls `setBrowseMode(true)`, causing App.tsx to render `<ReadOnlyBrowse />` instead of the decision panel.

## 3. ReadOnlyBrowse component

- [ ] 3.1 Create `web/src/components/ReadOnlyBrowse.tsx`. On mount, fetch `/api/browse/markdown-tree` and render a left sidebar tree of markdown files.
- [ ] 3.2 Clicking a file → fetches `/api/browse/markdown?path=<rel>` and renders in the right pane via the same react-markdown + remark-gfm setup used by `SpecView.tsx`.
- [ ] 3.3 An "Exit browse mode" button in the top-right returns to the decision panel (`setBrowseMode(false)`).
- [ ] 3.4 Style `.read-only-browse` in `web/src/styles.css` — 2-column layout matching Specs page proportions; muted "read-only" badge in the header.
- [ ] 3.5 Hide the entire dashboard chrome (topbar tabs, terminal, etc.) while `browseMode === true` — only the browse UI + a "Back to decision" button.

## 4. Server endpoints

- [ ] 4.1 `GET /api/browse/markdown-tree` in `server/index.ts` (or a new `server/browse.ts` router). Returns a JSON array of `{ path: string; name: string; kind: "file" | "dir"; children?: MarkdownTreeNode[] }`. Include only `.md` / `.markdown` files. Scan patterns:
  - Root: `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `LICENSE.md`
  - Directories: `docs/**/*.md` (recursive, capped at 5 levels deep, 500 files total)
  - Skip: `node_modules/`, `.git/`, `.worktrees/`, `dist/`, `build/`, `coverage/`, any `.gitignore`-declared paths
- [ ] 4.2 `GET /api/browse/markdown?path=<rel>` — returns `{ path: string, content: string }`. Validate `path` is relative and resolves inside the project root (reject `..`, absolute paths, symlinks that escape). Return 400 on invalid path, 404 on missing file, 200 with content otherwise. Cap at 5 MB per file.
- [ ] 4.3 Both endpoints require the session token (per existing auth middleware).
- [ ] 4.4 Both endpoints are enabled regardless of `openspec/` presence — this is the whole point (browse works on non-openspec dirs).

## 5. CLAUDE.md detection

- [ ] 5.1 Extend `GET /api/state` to include `hasClaudeMd: boolean` (checks `<project>/CLAUDE.md` at root). Non-breaking additive field.
- [ ] 5.2 `<NoProjectDecisionPanel />` reads `state.hasClaudeMd` and renders the hint line conditionally.

## 6. Read-only guardrails

- [ ] 6.1 In `ReadOnlyBrowse.tsx`, ensure no dispatch / init / mutating calls are triggered from any child component. React tree simply doesn't render the Kanban / Terminal / etc.
- [ ] 6.2 Server-side: no new mutating routes added under `/api/browse/*` — only the two GETs.
- [ ] 6.3 Terminal auto-launch is suppressed while `browseMode === true` (also covered by the separate `guard-terminal-autolaunch-on-agents-yaml` change — but this change makes the same guard explicit for browse mode as a defensive layer).

## 7. Tests

- [ ] 7.1 `server/browse.test.ts` (new): assert `/api/browse/markdown-tree` returns the expected shape on a fixture directory; assert `/api/browse/markdown?path=..%2fpassword` returns 400; assert path outside root returns 400.
- [ ] 7.2 `web/src/components/NoProjectDecisionPanel.test.ts` (new): render the panel with `hasClaudeMd = true/false`, assert the hint appears/absent; assert clicking each button dispatches the expected store action.
- [ ] 7.3 `web/src/components/ReadOnlyBrowse.test.ts` (new): render with a mock tree, assert markdown file clicks fetch + render.

## 8. Verification

- [ ] 8.1 `npm run openspec -- validate unify-open-project-3-branch --strict` passes.
- [ ] 8.2 `npm test` passes (including new tests in 7).
- [ ] 8.3 `npm run typecheck` passes.
- [ ] 8.4 `npm run build` passes.
- [ ] 8.5 Manual (Electron): File → Open Project → pick a folder that has NO `openspec/` (e.g., an existing Flutter repo). Verify:
  - 3-branch decision panel appears with correct heading naming the folder
  - CLAUDE.md hint appears when the folder has one, absent otherwise
  - Initialize button runs `openspec init` and reloads to Kanban
  - Cancel button returns to Open Project dialog
  - Browse button loads ReadOnlyBrowse with the folder's markdown files (docs/, README.md, CLAUDE.md, CONTRIBUTING.md as applicable)
- [ ] 8.6 Manual (Electron): Open Project → pick a folder that HAS `openspec/`. Behavior unchanged — dashboard loads Kanban as today.
- [ ] 8.7 Manual (browser): `ithyno --dir <non-openspec-path>` — same 3-branch panel appears (Cancel button shows the browser-appropriate helper message instead of re-invoking dialog).
- [ ] 8.8 Manual security: with Browse mode active, try requesting `/api/browse/markdown?path=../../etc/passwd` via devtools — expect 400 with a clear denial message; no file returned.
- [ ] 8.9 Write `openspec/changes/unify-open-project-3-branch/outcome.md` (✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups). Follow-ups: consider extending Browse mode to non-markdown files (source-code view); consider a "generate spec from this" button in Browse mode that hands off to the future `import-project-spec-generation`.
