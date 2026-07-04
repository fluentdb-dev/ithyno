## 1. Kanban: gate Start on worktree existence

- [x] 1.1 `web/src/components/Kanban.tsx` `ChangeCard`: Start-button guard now uses `!job` (any job entry means a worktree exists on disk) instead of `!isRunningOrPending(job)`; `isRunningOrPending` import dropped
- [x] 1.2 The `verify only` pill's guard stays coupled to Start's — hidden together via the same `!job` branch

## 2. Kanban: Archive primary button on orphaned

- [x] 2.1 New button rendered when `job?.status === "orphaned"` and `onArchive` is provided
- [x] 2.2 Button label `Archive`, class `action-btn` (matches the Kanban Start button — the row's primary weight in that context; no bespoke `primary` variant needed), positioned before `View diff` / `Merge` / `Discard`
- [x] 2.3 Click handler calls `onArchive()` — same handler the DONE-column Archive uses, so the shared CommandModal opens with `/ithy-opsx:archive` preview
- [x] 2.4 `onArchive` now passed to ChangeCards in `todo` and `inprogress` columns (previously only `done`), so the orphaned case can reach it

## 3. Style

- [x] 3.1 No new class; Archive matches the Kanban Start button's `action-btn` weight
- [x] 3.2 Merge button changed from `action-btn` to `action-btn ghost` so Archive (primary weight) stands out against secondary Merge / Discard / View diff

## 4. Docs

- [ ] 4.1 `docs/architecture/parallel-shells.md`: update the "Orphan adoption" note to mention that the Kanban card now surfaces `Archive` as the primary action for the orphaned state (deferred — will land with add-orphan-worktree-adoption's archive)

## 5. Verification

- [ ] 5.1 Start an agent under Worktree mode; while running, the card shows no `Start` button (regression check — running state was already blocked)
- [ ] 5.2 Kill the server (or otherwise orphan the worktree); restart; the card badge reads `orphaned` and the row shows `Archive` (primary) + `View diff` + `Merge` + `Discard`, no `Start`
- [ ] 5.3 Click `Archive` on an orphaned card → CommandModal preview reads `/ithy-opsx:archive <change-id>`
- [ ] 5.4 Send → skill runs (commits worktree work → merges → archives → commits archive → offers cleanup); operator confirms end-to-end
- [ ] 5.5 For `completed` / `crashed` / `cancelled` post-run cards (not orphaned), the Archive button does NOT appear in the row — DONE-column Archive stays the sole entry
