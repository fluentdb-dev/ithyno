# Tasks

## 1. App.tsx branch rewrite

- [ ] 1.1 Remove the `if (browseMode && !authExpired) return <ReadOnlyBrowse />;` early-return block.
- [ ] 1.2 Change the empty-state gate. Currently: `{!loading && state && !state.exists && !importFlowActive && <NoProjectDecisionPanel />}`. Extend the guard to also skip the panel when `browseMode === true`:
  `{!loading && state && !state.exists && !importFlowActive && !browseMode && <NoProjectDecisionPanel />}`
- [ ] 1.3 Change the Routes gate. Currently: `{!loading && state?.exists && <Routes>...</Routes>}`. Broaden to also render when browseMode is true so an empty Kanban shows:
  `{!loading && (state?.exists || browseMode) && <Routes>...</Routes>}`
- [ ] 1.4 Drop the `import { ReadOnlyBrowse } from "./components/ReadOnlyBrowse";` line — no longer referenced.

## 2. NoProjectDecisionPanel button copy

- [ ] 2.1 Change the second button label from `Browse read-only` to `Open dashboard anyway` (or similar) to match the new behavior — user is not browsing markdown, they're opening the empty dashboard.
- [ ] 2.2 Update the JSDoc header of `NoProjectDecisionPanel.tsx` to reflect the new second-branch semantics.

## 3. Inert code left as-is (documented)

- [ ] 3.1 Keep `web/src/components/ReadOnlyBrowse.tsx` on disk. Add a top-of-file comment: `// UNUSED as of simplify-browse-to-kanban (2026-07-24). Preserved in case a future "docs preview" feature reuses the two-pane tree.`.
- [ ] 3.2 Keep `server/browse.ts`, `GET /api/browse/markdown-tree`, `GET /api/browse/markdown` in place. No changes.

## 4. Tests

- [ ] 4.1 Update `web/src/components/NoProjectDecisionPanel.test.ts` — the button label test (if any) needs the new copy.
- [ ] 4.2 `web/src/App.test.tsx` (new or extended): assert that when `browseMode === true` AND `state.exists === false`, the app renders the topbar + Overview (Kanban) rather than NoProjectDecisionPanel or ReadOnlyBrowse.
- [ ] 4.3 `web/src/components/ReadOnlyBrowse.test.ts` — either delete (component unused) or leave existing tests but note they test dead code.

## 5. Verification

- [ ] 5.1 `npm run openspec -- validate simplify-browse-to-kanban --strict` passes.
- [ ] 5.2 `npm test` passes.
- [ ] 5.3 `npm run typecheck` passes.
- [ ] 5.4 `npm run build` passes.
- [ ] 5.5 Manual: open a non-openspec folder → NoProjectDecisionPanel shows → click "Open dashboard anyway" → topbar renders + Overview shows empty Kanban (no `Change` columns populated) + terminal aside per agents.yaml guard.
- [ ] 5.6 Manual: click Initialize on the same panel — normal behavior unchanged (init runs, dashboard transitions to real openspec Kanban).
- [ ] 5.7 Write `openspec/changes/simplify-browse-to-kanban/outcome.md`.
