## 1. API / Store / Types

- [ ] 1.1 `web/src/types.ts` に `RuntimeStatusResponse` type を追加 (server の `GET /api/agents/runtimes` shape mirror)
- [ ] 1.2 `web/src/api.ts` に `fetchAgentRuntimes(refresh?: boolean): Promise<RuntimeStatusResponse>` 追加
- [ ] 1.3 `web/src/store.ts` に `runtimes: RuntimeStatusResponse | null` state、`loadRuntimes()` action、error handling

## 2. Agents.tsx — 4 section 再構成

- [ ] 2.1 Runtimes section (top) — installed / not-installed 表示、count summary、hidden when empty、refresh button
- [ ] 2.2 Live section — 現行 "Active jobs" を rename、role / runtime badge 追加、drill-in 保持
- [ ] 2.3 Configured (idle) section — 現行 "Configured agents" を rename、running を除外、role / runtime / specialties 表示
- [ ] 2.4 Recent jobs section — verdict badge (pass / needs-rework / undefined non-display)、role / runtime badge

## 3. Job row 拡張

- [ ] 3.1 role / runtime badge を head に表示 (Live + Recent 共通)
- [ ] 3.2 verdict badge を Recent の完了 job のみ表示 (running 中は verdict なしで正常)

## 4. CSS

- [ ] 4.1 `.runtime-row` (base + installed variant + not-installed variant)
- [ ] 4.2 `.job-role-badge` / `.job-runtime-badge` (color-coded by role)
- [ ] 4.3 `.job-verdict-badge` (pass → green、needs-rework → amber、count 表示)

## 5. Refresh mechanism

- [ ] 5.1 Runtimes section に "Refresh" button
- [ ] 5.2 Click 時に `fetchAgentRuntimes(refresh=true)` を呼ぶ

## 6. Spec delta

- [ ] 6.1 `openspec/changes/add-agents-tab-live-panel/specs/dashboard/spec.md` に 3 ADDED requirements:
  - **Agents Tab Runtimes Section** — runtime installed 状況の可視化
  - **Agents Tab Live Section** — 実行中 agent の role / runtime badge
  - **Agents Tab Verdict Badge On Recent Jobs** — 完了 review job の verdict badge
- [ ] 6.2 `npm run openspec -- validate add-agents-tab-live-panel` VALID

## 7. Manual verification

- [ ] 7.1 dev server 起動、Agents タブを開いて 4 section が表示される — DEFERRED to post-merge smoke
- [ ] 7.2 現行 legacy agent は `runtime: legacy` と表示 — DEFERRED
- [ ] 7.3 runtimes: 未定義 shape でも section が hide されるのみで crash しない — DEFERRED

## 8. Verification

- [ ] 8.1 `npm test && npm run typecheck && npm run build` clean
- [ ] 8.2 tests 234 維持 or 追加 (state update logic の unit test を書ける範囲で)

## 9. Post-impl

- [ ] 9.1 phase-workflow へ merge
- [ ] 9.2 archive → phase-workflow に archive commit
- [ ] 9.3 次: Phase 5.2 `add-agents-config-ui` or Phase 3+4 → main の大 merge 判断
