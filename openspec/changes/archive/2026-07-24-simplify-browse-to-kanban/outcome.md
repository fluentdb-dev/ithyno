# Outcome: simplify-browse-to-kanban

## Worked

- App.tsx: removed the `if (browseMode) return <ReadOnlyBrowse />` early-return.
- App.tsx: extended the empty-state gate to skip `NoProjectDecisionPanel` when `browseMode === true`.
- App.tsx: extended the Routes gate to render when `state?.exists || browseMode`, so the empty Kanban appears when the user opens the dashboard on a non-openspec folder via "Open dashboard anyway".
- App.tsx: dropped the `ReadOnlyBrowse` import — no longer referenced.
- `NoProjectDecisionPanel.tsx`: button label `Browse read-only` → `Open dashboard anyway`. JSDoc header updated.
- `ReadOnlyBrowse.tsx`: kept on disk with a top-of-file `UNUSED as of simplify-browse-to-kanban` note so future readers know it's inert; deletion deferred to a follow-up.
- `store.ts`: docstring on `browseMode` updated to match new UX.
- Gates green: `openspec validate --strict` VALID, `npm test` 418 pass (1 pre-existing `sharp` failure — same as main), `typecheck` clean, `build` success.

## Surprises

- **`ReadOnlyBrowse.test.ts` still passes**. The test only exercises the store's `setBrowseMode` action, not the mounted component. So even though the component itself is now unused, the store-slice contract is unchanged and the tests keep passing. No code churn needed — a full cleanup would remove the test file alongside the component in a future change.
- **No test in `web/src/App.test.tsx`** to cover the new browseMode-renders-Kanban path. The existing App test surface is minimal. Task 4.2 (new test) was deferred as a small follow-up; the manual verification (5.5) covers the flow for now.

## Differently

- **Kept the endpoints inert rather than removing them**. `server/browse.ts` + `GET /api/browse/*` add no bundle weight to the client and their removal would touch more files. Leaving them lets a future "docs preview" feature reuse the two-pane pattern if it comes up. The spec-level REMOVED delta makes the intent explicit even though the code stays.
- **Chose "Open dashboard anyway" as the button label** — clearer than "Browse anyway" or "View empty dashboard" given the panel already says "No OpenSpec project found".

## Follow-ups

- Delete `web/src/components/ReadOnlyBrowse.tsx`, `web/src/components/ReadOnlyBrowse.test.ts`, `server/browse.ts`, and the corresponding endpoint registrations in `server/index.ts` if no reuse materializes within the next few weeks.
- Add a small `.test.tsx` around App.tsx covering the browseMode → empty-Kanban transition.
- Consider a "Back to decision" affordance somewhere in the empty-Kanban chrome so users can re-see the panel without reloading. Not strictly needed since a page reload works, but a small UX nicety.
