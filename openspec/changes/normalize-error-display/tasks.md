# Tasks — normalize-error-display

## 1. Extract error message constants

- [x] 1.1 `web/src/lib/errorMessages.ts` 新規 — `ERR` object export
  (`NO_TERMINAL`, `INJECT_FAILED`, `SENT_TO_TERMINAL`, `LOCK_HELD`)

## 2. CSS consolidation

- [x] 2.1 `.field-error` / `.agent-config-error` /
  `.agent-config-server-error` 削除 (from `styles.css`)
- [x] 2.2 `.parse-error` に convention コメント追加
- [x] 2.3 `.form-field-error` 新規 (2 削除分の共通形)

## 3. Call sites を新 class / 定数へ

- [x] 3.1 `App.tsx`: `<p>` → `<div>⚠ ...</div>` markup 統一
- [x] 3.2 `useStartFlow.tsx`: `ERR` 使用 (NO_TERMINAL / LOCK_HELD /
  INJECT_FAILED / SENT_TO_TERMINAL)
- [x] 3.3 `Kanban.tsx`: `ERR.NO_TERMINAL` / `ERR.INJECT_FAILED`
- [x] 3.4 `Overview.tsx`: 同上 + `ERR.SENT_TO_TERMINAL`
- [x] 3.5 `ChangeDetail.tsx`: 同上
- [x] 3.6 `CommandModal.tsx`: `.field-error` → `.form-field-error`
- [x] 3.7 `AgentConfigModal.tsx`: `.agent-config-error` →
  `.form-field-error` (2 か所)、`.agent-config-server-error` →
  `.parse-error`

## 4. Verify

- [x] 4.1 `openspec validate --strict` VALID
- [x] 4.2 `npm test && npm run typecheck && npm run build` clean
  (213 pass / 1 skip)
- [x] 4.3 手動 (Puppeteer): lock gate toast の文言が
  `ERR.LOCK_HELD(change)` 生成のまま統一 = `Change
  fake-holder-change is currently running. Merge or discard it
  first.` — refactor 前後で文言不変
- [ ] 4.4 手動: CommandModal invalid input で `.form-field-error`
  が実際に render される確認 — **pending** (現状の CommandModal
  invalid input が起こるパスが限定的、実測 skip)
- [ ] 4.5 手動: agents.yaml を壊して `.parse-error` div + ⚠ の統一
  markup 確認 — **pending**
- [ ] 4.6 手動 (screenshot 比較): 3 パターンの視覚的統一 — **pending**

## 5. Post-impl

- [x] 5.1 outcome.md
- [ ] 5.2 `/ithy-opsx:archive normalize-error-display`
