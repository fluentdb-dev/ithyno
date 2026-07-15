# Delta: agent-runner — revert worktree pool

## REMOVED Requirements

### Requirement: Worktree Pool Opt-In Configuration

**Reason for removal**: runtime-collapse pivot 方針の下、pool 機構自体を
撤廃。agent は常に `.worktrees/<change-id>/` に dedicated worktree で
spawn される Phase 1 初期形に戻す。`dedicated` field と `worktreePool:` block
は消失。

**Migration**: `agents.yaml` の `worktreePool:` block と agent の
`dedicated: false` は unknown key として扱われる or 無視される (次の
起動で warning)。現行 project の agents.yaml では `dedicated: false` を
claude agent が持っているので、`true` に変更 (or field 削除)。

### Requirement: Pool Worktree Acquisition

**Reason for removal**: pool 撤廃に伴い acquisition プロトコルも撤去。
runner は `git worktree add .worktrees/<change-id> -b agent/<change-id>`
を直接叩く形に戻る。

**Migration**: 動作上の変化は「pool slot 上限による並列制限がなくなる」
点。実用上、Claude が多数 change を並列に走らせるユースケースは
runtime-collapse 方針の下では稀なので影響軽微。

### Requirement: Pool Worktree Release And Cleanup

**Reason for removal**: acquisition の対になる release / cleanup も撤去。
job 終了後の worktree は Merge / Discard action で user がハンドルする
既存フローに一本化。

**Migration**: `git clean` による pool slot 自動 cleanup は起きなくなる。
`.worktrees/<id>/` を hand-remove するか、UI の Discard action を使う。

### Requirement: Pool Worktree Restart Recovery

**Reason for removal**: 起動時の pool slot 復元ロジック撤去。orphan
worktree の adoption 自体は残る (別 change: add-orphan-worktree-adoption)
が、pool slot として認識する部分だけ剥がす。
