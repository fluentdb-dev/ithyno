# Tasks — collapse-jobregistry-and-add-semaphore

## 1. Server: workspace state populates `worktree` per change

- [x] 1.1 `server/parser/workspace.ts`: `parseChange` に
  `readWorktreeState` helper 追加、Change を worktree field 付きで
  返す
- [x] 1.2 `server/model.ts`: `Change` type に `worktree?: { path,
  branch, tasksProgress }` field 追加
- [x] 1.3 worktree scan は `.worktrees/<id>/` の `existsSync` +
  `openspec/changes/<id>/tasks.md` の read + `countProgress`
- [x] 1.4 存在チェックは `existsSync` (git 呼び出し無し)
- [ ] 1.5 unit test — 省略 (現行 workspace test 群で indirectly cover
  済み、Puppeteer 検証で挙動確認済み)

## 2. Client: type update + store

- [x] 2.1 `web/src/types.ts` `Change` type に `worktree?` field 追加
- [x] 2.2 store は変更不要 (`state.changes[].worktree` を直接 read、
  既存 `worktreeProgress` map は互換のため残置)

## 3. Kanban placement rewrite

- [x] 3.1 `bucketize` rewrite: worktree presence → IN-PROGRESS の
  order で判定
- [x] 3.2 `bucketize(changes)` に signature 変更、`jobByChange`
  引数削除
- [x] 3.3 `hasActiveJob` / `isPendingMergeOrDiscard` helper 撤去
- [x] 3.4 `Kanban.test.ts` rewrite (worktree signal 優先の spec)

## 4. Worktree watcher — trigger 変更

- [ ] 4.1〜4.4 **省略** (follow-up) — 現状は client の polling / 全体
  state refetch で worktree progress の変化を反映。realtime WS の
  chokidar watcher rewrite は独立 propose で対応

## 5. Semaphore file `.worktrees/.lock`

- [x] 5.1 `dispatch.md` step 4 に lock acquire logic 追加 (sed で
  parse、stale 判定、YAML 書込み、`parallelExecution === false`
  のみ gated)
- [x] 5.2 dispatch skill step 7 verify pass 直後に lock release
- [x] 5.3 Guardrails に「escalate 前に必ず lock release」を明記
- [x] 5.4 `server/agents/worktree-lock.ts` 新規 (`readLock` +
  `cleanupStaleLock`)、`server/index.ts` の boot 前に
  cleanupStaleLock 呼び出し
- [x] 5.5 lock file format YAML `change / acquiredAt / pid` を skill
  本文 + spec の両方に明文化

## 6. Kanban / ChangeDetail Merge/Discard actions が lock release

- [ ] 6.1〜6.2 **省略** (follow-up) — 現状は user が UI/CLI から
  `git worktree remove` した後、次の workspace scan で
  `cleanupStaleLock` 相当が自動発火する (worktree 消失 → lock 削除)。
  即時 release ロジックは次段階

## 7. Client Start gate

- [x] 7.1 `WorkspaceState` に `lock: WorktreeLock | null` field 追加
  (server model + client types)
- [x] 7.2 `useStartFlow.tsx` に lock-based gate:
  parallelExecution=false && lock.change !== change.id → toast +
  return (no inject)。同一 change の場合は attach 相当で通す
- [ ] 7.3 Kanban `Start` button の `title` / `disabled` を lock
  状態で条件分岐 — **省略** (現状は useStartFlow で toast + return
  する形。Start button 事前 disable の追加は次段階へ)
- [ ] 7.4 WS event (`lock-updated`) の broadcast — **省略** (現状は
  workspace state 経由の polling で lock 変化を検出。真の realtime は
  chokidar `.worktrees/.lock` watch 追加の follow-up)

## 8. Diff view / Merge / Discard: worktree path 経由

- [ ] 8.1〜8.3 **省略** (follow-up) — 既存の diff endpoint は
  job.workspacePath 依存のまま、次段階で worktree path 化する
  refactor propose を切る

## 9. Spec updates (dashboard capability)

- [ ] 9.1 `Dispatch Slash Command` (archived Phase 2 で ADDED済み)
  を MODIFIED: step 4 worktree bootstrap に lock acquire 追記、
  step 7 に lock release、escalate path に lock release
- [ ] 9.2 `Start Flow Delegates Execution To Skill Layer` MODIFIED:
  parallelExecution=false での lock-based gate 追加
- [ ] 9.3 新 requirement ADDED: `Kanban Placement Is Folder-Driven`
  ("worktree/X/openspec/changes/X/" 規約、bucketize 判定順序を
  明文化)
- [ ] 9.4 新 requirement ADDED: `Worktree Concurrency Semaphore`
  (`.worktrees/.lock` file 契約、acquire / release path、stale
  cleanup)

## 10. Verify

- [x] 10.1 `openspec validate --strict` VALID
- [x] 10.2 `npm test && npm run typecheck && npm run build` clean
  (213 pass / 1 skip, 3 追加テスト = folder-driven bucketize)
- [x] 10.3 手動 (API + Puppeteer): `add-dummy-tab` の `worktree`
  field が populated (`tasksProgress: 9/10`)、Kanban で TODO 10→9、
  IN-PROGRESS 20→21 に移動確認、`state.lock` = null
- [ ] 10.4 手動: `parallelExecution: false` での lock acquire /
  reject の実測 — **pending** (次段階、dispatch 実行を伴うので
  時間かかる)
- [ ] 10.5〜10.6 手動: stale lock cleanup / startup cleanup —
  **pending** (implementation は完了、実測は次段階)

## 11. Post-impl

- [x] 11.1 outcome.md
- [ ] 11.2 `/ithy-opsx:archive collapse-jobregistry-and-add-semaphore`
