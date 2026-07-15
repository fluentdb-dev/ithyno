# Tasks — revert-dispatch-endpoint

## 1. Spec deltas

- [x] 1.1 3 REMOVED requirements in specs/dashboard/spec.md
- [x] 1.2 `npm run openspec -- validate revert-dispatch-endpoint` VALID

## 2. Impl reverts

- [x] 2.1 `server/agents/dispatch.ts`: file 削除 (selectAgent + POST /api/agents/dispatch handler)
- [x] 2.2 `server/index.ts`: dispatch route の register 呼び出しを削除
- [x] 2.3 `.claude/commands/opsx/dispatch.md`: slash command 削除
- [x] 2.4 `.claude/skills/opsx-dispatch/` (存在すれば) directory 削除
- [x] 2.5 Manager loop skill (`.claude/skills/opsx-manage/SKILL.md` 等) が `/opsx:dispatch` を参照している場合、Task tool 経由呼び出しに書き換え (もしくは別 change で対応する旨のマーカーコメント追加)

## 3. Test updates

- [x] 3.1 `server/agents/dispatch.test.ts`: file 削除
- [x] 3.2 他 test が `import from "./dispatch"` してないか grep → 参照あれば削除 or stub

## 4. Target archive annotations

- [x] 4.1 `openspec/changes/archive/2026-07-07-add-dispatch-endpoint/proposal.md` に REVERTED annotation 挿入 (auto-inserted by /opsx:revert; verify by inspection)

## 5. In-flight spec 注記

- [x] 5.1 PENDING REMOVAL annotation on 3 target requirements in openspec/specs/dashboard/spec.md
- [x] 5.2 (auto-inserted by /opsx:revert; verify by inspection)

## 6. Verification

- [x] 6.1 `npm test && npm run typecheck && npm run build` clean
- [x] 6.2 手動: `curl -X POST http://localhost:4321/api/agents/dispatch` が 404 を返す (verified: dev server restart 後 HTTP 404 `{"error":"not found"}` を確認)
- [ ] 6.3 手動: Kanban Start 経由の agent 起動が動作継続 (skill 経由 path が壊れていない)

## 7. Post-impl

- [x] 7.1 phase-workflow へ merge (worktree flow) — N/A: in-place impl on phase-workflow, no worktree
- [x] 7.2 outcome.md 記入 (✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups)
- [ ] 7.3 `/ithy-opsx:archive revert-dispatch-endpoint`
