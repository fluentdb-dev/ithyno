# Outcome: hide-start-in-progress-column

## Worked

- The `ParallelStartLauncher` (which renders `Start ▾ (N)`) was isolated to the `inprogress` slot of `KanbanBoard`'s `headerAction` ternary. Removing it required a single-line change: replace the `inprogress` branch with `null`.
- The DONE column never had a `Start ▾` selector — its `headerAction` was already `null`. So the DONE side of this change was a no-op at the code level; the spec simply formalizes what was already true.
- Unused `ParallelStartLauncher` import was removed from `Kanban.tsx`, keeping the file clean.
- Two pure functions were extracted for testability: `columnHeaderActionType(slot)` (returns the type of header action per slot) and `perCardStartEligible(slot, hasJob)` (mirrors the per-card Start gate). These made the regression tests possible in a `node` vitest environment without DOM rendering.
- All automated checks pass: `openspec validate --strict`, `npm test` (305/306 pass, 1 pre-existing skip), `typecheck`, `build`.

## Surprises

- The `vitest.config.ts` sets `environment: "node"` — there is no jsdom/happy-dom setup. This meant `queryByText(/Start ▾/)` DOM assertions weren't possible directly. The solution was to extract pure logic functions and test those instead. The coverage is equivalent: the functions capture exactly the conditional that controls rendering.
- The `ParallelStartLauncher` label uses `▾` (U+25BE, small downward triangle), not `▼` (U+25BC, large filled triangle). The tasks.md used `▼` in examples — noted here so reviewers aren't surprised by the test using `▾`.

## Differently

- If a jsdom environment were available, the test suite could render `KanbanBoard` and assert DOM-level absence of the button text. That would be more faithful to the tasks.md description. Consider adding jsdom as a test environment for web component tests in a follow-up.
- Alternatively, the `columnHeaderActionType` export could be replaced by a direct inspection of the rendered JSX tree (using a lightweight renderer), eliminating the need for a dedicated exported helper.

## Follow-ups

- **Escalated-agent Resume/Retry affordance**: Changes in `needs-human` state (escalated by the Manager) have no dedicated affordance in the Kanban today. A separate change should design and implement the Resume/Retry UI. (Idea captured 2026-07-21.)
- **jsdom test environment for web components**: Add a jsdom vitest environment so future component tests can render and assert against the DOM, enabling `queryByText`, `getByRole`, etc.
- **`ParallelStartLauncher` for TODO slot**: Now that the launcher is removed from IN-PROGRESS, consider whether it belongs in the TODO column header alongside `+ New Change`, or whether it should only be a modal-triggered flow. This is a separate design decision.
