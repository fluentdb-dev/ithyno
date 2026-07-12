## 1. In-flight spec 注記 (CLAUDE.md hard rule)

- [x] 1.1 Added `> ⚠️ **PENDING MODIFICATION** by [refine-manager-fallback-copy](...)` under `### Requirement: Agents Tab Manager Section` in `openspec/specs/dashboard/spec.md`

## 2. Client copy

- [x] 2.1 `web/src/pages/Agents.tsx::ManagerSection` — Not-configured state:
  - Header: `Manager (not configured in agents.yaml):` (was `Manager (fallback):`)
  - Explanation line: `Currently running the built-in default startup command.` when `fallbackSource === "default"`, `Currently running the command from ITHYNO_TERMINAL_STARTUP.` when `"env"` (replaces `Source: <label>`)
- [x] 2.2 Idle state message: `will run the built-in default until you declare one.` (was: `will run the hardcoded default until you declare one.`)

## 3. Spec deltas

- [x] 3.1 1 MODIFIED requirement in `specs/dashboard/spec.md`
- [x] 3.2 `npm run openspec -- validate refine-manager-fallback-copy` VALID

## 4. Verification

- [x] 4.1 `npm test && npm run typecheck && npm run build` clean (no tests touched — text-only)
- [ ] 4.2 UI: Manager section の header が **`Manager (not configured in agents.yaml): claude --continue`** (以前の `Manager (fallback):` ではない)
- [ ] 4.3 UI: 説明行が **`Currently running the built-in default startup command.`** (以前の `Source: hardcoded default` ではない)
- [ ] 4.4 UI: `ITHYNO_TERMINAL_STARTUP=aider` 設定 + 再起動 → 説明行が `Currently running the command from ITHYNO_TERMINAL_STARTUP.`
- [ ] 4.5 UI: Terminal panel 全部閉じた idle 状態 → `will run the built-in default until you declare one.` (以前の `hardcoded default` ではない)
- [ ] 4.6 API: 内部 shape (`fallbackSource: "declared" | "env" | "default"`) は変わっていない (curl `/api/manager/status` で確認)

## 5. Post-impl

- [x] 5.1 phase-workflow へ merge (worktree flow) — via merge step
- [ ] 5.2 archive → user が 4.2 を確認後に実施
- [x] 5.3 rebuild dist so the UI on :55910 picks up the new copy — via post-archive build
