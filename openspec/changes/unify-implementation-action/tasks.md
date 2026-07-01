## 1. Server: parse execution field
- [x] 1.1 Update `parseProposal` to extract `execution` from frontmatter (case-insensitive)
- [x] 1.2 Canonicalize to `"worktree" | "terminal" | undefined` (drop unrecognized values)
- [x] 1.3 Add `execution?: "worktree" | "terminal"` to `ProposalDoc` in `server/model.ts`
- [x] 1.4 Mirror the field in `web/src/types.ts`

## 2. Server: proposal frontmatter surgical edit (write-back)
- [x] 2.1 New helper in `server/parser/proposal-edit.ts` that inserts or updates `execution: <mode>` inside an existing frontmatter block
- [x] 2.2 When no frontmatter exists, prepend `---\nexecution: <mode>\n---\n` to the file
- [x] 2.3 Endpoint `POST /api/changes/:id/proposal/execution` with `{ mode }` body, protected by the existing auth + CSRF gate
- [x] 2.4 Baseline: watcher already re-parses the change; no bespoke event needed

## 3. Web: shared `startImplementation` handler
- [x] 3.1 Extract the current Run + Apply handler logic into `startImplementation(change)` in `Kanban.tsx` (or a small helper)
- [x] 3.2 Dispatch on `change.proposal?.execution`
- [x] 3.3 Fall back to `openExecutionPicker(change)` when unset

## 4. Web: ExecutionPicker component
- [x] 4.1 Two option cards inside the existing `CommandModal` (Terminal vs Worktree)
- [x] 4.2 Per-card preview line (terminal: `/opsx:apply <id>` or CLI equivalent; worktree: `git worktree add …` + agent command)
- [x] 4.3 Disable Terminal when no active terminal (fresh check via `/api/pty/inject` availability heuristic OR store flag)
- [x] 4.4 Disable Worktree when `agents.yaml` is empty
- [x] 4.5 Disable Terminal in CLI mode with existing "Apply requires Claude Code" hint
- [x] 4.6 "Save to proposal" checkbox; when checked and Start clicked, PATCH the proposal before dispatching

## 5. Web: Kanban integration
- [x] 5.1 Rename Run button label to Start
- [x] 5.2 Drag TODO → IN-PROGRESS now calls `startImplementation` instead of opening the Apply modal directly
- [x] 5.3 Keep `hide-run-on-verify-only` gate on both drag and click

## 6. Style
- [x] 6.1 Picker card CSS (two-column, collapsing on narrow viewports)
- [x] 6.2 Disabled state styling for unavailable options

## 7. Tests
- [x] 7.1 Unit test for `parseProposal`'s `execution` field (worktree / terminal / mixed case / unknown / missing)
- [x] 7.2 Unit test for the frontmatter surgical-edit helper (insert / update / no-frontmatter cases)

## 8. Docs
- [ ] 8.1 Update `docs/migration-guide.md` and `docs/architecture/parallel-shells.md` with the unified action
- [ ] 8.2 Skill update: proposal frontmatter now recognizes `execution:`

## 9. Verification
- [ ] 9.1 Proposal with `execution: worktree`: drag or click → spawn without picker
- [ ] 9.2 Proposal with `execution: terminal`: drag or click → Apply modal without picker
- [ ] 9.3 Proposal without `execution`: drag or click → picker appears with both options
- [ ] 9.4 Save to proposal writes the field and next start skips the picker
- [ ] 9.5 CLI mode disables Terminal option in the picker
- [ ] 9.6 Empty `agents.yaml` disables Worktree option in the picker
- [ ] 9.7 Verify-only cards still show no Start action (existing gate preserved)
