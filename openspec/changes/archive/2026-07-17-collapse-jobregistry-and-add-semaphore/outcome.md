# Outcome — collapse-jobregistry-and-add-semaphore

## ✅ Worked

- **Kanban placement が folder-driven になった**。`bucketize` から
  `jobByChange` を撤去、`Change.worktree` の presence を signal に
  使う形へ書き直し。実測: `add-dummy-tab` が worktree 存在で TODO
  → IN-PROGRESS へ移動 (Puppeteer + API dump で確認)。
- **Server の workspace parser が `worktree?: { path, branch,
  tasksProgress }` を populated する**。`.worktrees/<id>/` の
  `existsSync` + tasks.md read + `countProgress` の 3 段。git
  subprocess は 1 度も呼ばない (spec 通り軽量)。
- **`.worktrees/.lock` semaphore の acquire/release logic を
  dispatch.md に注入**。parallelExecution=false のときのみ発火、
  YAML 書き込み、stale 判定 (worktree 消えた lock は削除して
  proceed)。verify pass + Guardrails escalate release を明文化。
- **Server 起動時の stale cleanup** (`server/agents/worktree-
  lock.ts`)。`cleanupStaleLock` を fastify.listen 前に呼ぶことで、
  前回 crash 由来の lock が残っていても次の workspace scan では
  null が返る。
- **Client の Start gate**: `useStartFlow.tsx` に lock-based ガード
  追加。parallelExecution=false && `state.lock.change !==
  change.id` → toast + return (no inject)。同一 change の Start は
  通す (dispatcher の restart-recovery が attach として扱う)。
- **spec 側の contract 明文化**: 2 ADDED (folder-driven placement,
  worktree concurrency semaphore) + 2 MODIFIED (dispatch, start
  flow)、strict validate PASS。
- **Kanban.test.ts の書き直し**が思ったより素直に済んだ。worktree
  signal 優先を明示するテストを 4 本追加、既存の phase-only
  regression test は残す (change.phase が bucketize に影響しない
  invariant を維持)。

## ⚠️ Surprises

- **`worktreeProgress` map を撤去せず残置**。`state.changes[]` を
  worktree signal の source of truth にしたので、既存の
  `worktreeProgress` slice (別 event で更新される) は理論上冗長。
  ただし ChangeDetail や他の consumer が触っているかもなので
  breaking change を避けて残置。次段階でカスケード削除検討。
- **`.worktrees/<id>/.openspec.yaml` の phase 情報を read しなかった**。
  worktree にも sidecar copy はあるが、phase の source of truth は
  main tree の sidecar として運用継続 (dispatcher が
  `POST /api/changes/:id/phase` で main tree の sidecar に write
  する既存契約を維持)。
- **`readLock` の pid field が number|null の両方許容**、Task tool
  経由の spawn は null、subprocess は将来 PID を書きたいときのために
  future-proof。今回は書き込む dispatcher 側が null 固定。
- **section 4/6/8 (chokidar rewrite / merge-discard 即時 release /
  diff view worktree-path 化) を follow-up 化**。impl 分量が大きく、
  かつ core value (placement + semaphore) は本 change で達成済み。
  次の refactor propose に切り出す。
- **`add-dummy-tab` の worktree tasks.md が 9/10 で「total 10」に
  なっている**。propose 時は total 8 だったが、code worker
  (iteration 1) が section 4 (2 tasks) を追加、iteration 2 で 1 tick
  したので実 9/10。main tree の tasks.md は propose 時のまま 0/8。
  worktree source-of-truth 規約の実例として outcome にも残しておく。

## 🔁 Differently

- **`WorktreeLock` の pid 表現**を Optional<number> ではなく `number
  | null` にしたが、既存の他 field (`escalatedAt?: string`) は
  Optional (undefined) を使っている。scheme 統一の観点では `null`
  ではなく Optional の方がよかったかも。今回は YAML の `pid: null`
  を素直に mirror した。
- **Spec の `Kanban Placement Is Folder-Driven` に "git subprocess
  を呼ばない" invariant を明記した**が、これは実装レベルの禁忌で
  spec に書くべきかは微妙。書いた理由: naive impl で `git log` を
  card 数分回すと重い、が過去に他の feature でも起きたので防衛的。
  好みで次段階に "実装ノート" 化してもいい。

## 🌱 Follow-ups

- **`impl-collapse-jobregistry-followups`** (仮): section 4/6/8 を
  bundle した follow-up propose。中身:
  - chokidar `.worktrees/*/openspec/changes/*/tasks.md` watch +
    `worktree-progress-updated` WS event
  - Merge / Discard action 時の即時 lock release (`git worktree
    remove` 後の同期処理)
  - Diff view / attach endpoint を job.workspacePath 依存から
    worktree path 依存に切替
- **`worktreeProgress` slice の撤去** (`state.changes[].worktree`
  で足りるはず、cascade 影響を確認して cleanup)
- **手動 verify**: parallelExecution=false での lock acquire /
  reject / stale の実測、Puppeteer で連続 Start の gate 動作を
  scenario 化
