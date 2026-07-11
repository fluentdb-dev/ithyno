---
tags: [phase-4, manager, skills, slash-commands, orchestrator]
phase: 4
milestone: Manager 本体 (後半 — Manager)
sequence: 2
depends_on:
  - add-worker-skills
  - add-dispatch-endpoint
  - add-review-artifact
  - add-phase-state-machine
enables:
  - add-agents-yaml-migration
  - Phase 3+4 → main の大 merge
---

## Why

Phase 4.1 で workers (`/opsx:review`, `/opsx:verify`, `/opsx:escalate`,
`/opsx:answer`) が揃った。Phase 4.2 は **Manager 本体** — user が
Kanban の [Apply] を押した時に PTY で起動する claude session の loop。

Manager は:
- 変更 (change) を Read して現状把握
- `/opsx:dispatch code <id>` で code worker を回す (Ithyno server が review-role
  agent を spawn、待機)
- 結果を待って verdict を parse
- `verdict = pass` → 次段 (review→verify→done) へ
- `verdict = needs-rework` → findings を prompt_suffix にして code 再 dispatch
- 収束しない (convergence loop) or worker 失敗 → escalate

Fable review HIGH #1 の指摘通り、Manager は **Bash + curl の loop** で、
slash command は magic RPC ではない。この loop の prompt template を今回
書く。

## What Changes

### 1. `/opsx:manage <change-id>` slash command

`.claude/commands/opsx/manage.md` 新規作成。Kanban [Apply] ボタンが将来
これを叩く形。

Loop 構造:

```
1. Read proposal.md, tasks.md, specs/, .openspec.yaml
2. Get current phase via GET /api/changes/:id/phase
   - If phase in {done, needs-human}: exit (nothing to advance)
3. Init: iteration = 0, priorFindings = ""

4. LOOP (until phase = reviewed or exit):
   a. Guard: iteration >= MAX_ITERATIONS (default 5)
      → escalate("Manager loop did not converge after N iterations")
      → exit
   b. iteration += 1

   c. Dispatch code:
      curl POST /api/agents/dispatch \
        {role: "code", changeId, promptSuffix: priorFindings, wait: true}
      - status ≠ completed → escalate + exit
      - Set phase = "coded"

   d. Dispatch review:
      curl POST /api/agents/dispatch \
        {role: "review", changeId, wait: true}
      - verdict.verdict = "pass"      → Set phase = "reviewed", break
      - verdict.verdict = "needs-rework" → priorFindings = format(verdict.findings)
                                            continue LOOP
      - verdict = undefined            → escalate + exit

5. Dispatch verify:
   curl POST /api/agents/dispatch \
     {role: "verify", changeId, wait: true}
   - verdict.verdict = "pass"      → Set phase = "done", report success, exit
   - verdict.verdict = "needs-rework" → escalate("verify failed", findings), exit
   - verdict = undefined            → escalate + exit
```

### 2. `/opsx:code <change-id>` slash command (code worker)

`.claude/commands/opsx/code.md` 新規作成。Phase 4.1 の workers に加えて
code worker が明示的に必要 (現状 `ithy-opsx-apply` skill が code 作業を
担っているが、Manager から `role: code` で dispatch する経路には `.claude/
commands/opsx/code.md` として declare した方が clean)。

Body:
- proposal.md / tasks.md を Read
- promptSuffix (Manager が渡してくる review findings) を context に
- worktree で tasks を実装 (未 tick task を順に処理)
- 実装終わりで `git commit` (既存 `ithy-opsx-apply` skill と同じ pattern)
- 実装できない場合は `/opsx:escalate` 呼ぶ

**既存 `.claude/skills/ithy-opsx-apply/` との関係**:
- `ithy-opsx-apply` は **legacy** として保持 — 既存 default agent
  (`claude` legacy shape) の initialInput が `/ithy-opsx:apply ${change_id}`
  なので触ると壊れる
- `/opsx:code` は Phase 4.2 で新設、Manager からのみ dispatch される新経路
- 将来的に `add-agents-yaml-migration` で agents.yaml を runtime-backed
  に書き換える時に、legacy claude agent が `/opsx:manage` に切り替わる or
  併存

### 3. Manager の safeguards

**Convergence guard**: `MAX_ITERATIONS = 5` を hard-coded。将来
`agents.yaml` に `manager.maxIterations` field を追加する idea note を
残す (`docs/ideas/2026-07-11-manager-max-iterations-config.md`)。

**Escalation on failure**: worker が status != completed で返した時 or
verdict undefined の時、Manager は `/opsx:escalate <id> "<reason>"` を
叩いて `phase: needs-human` に落とす。User が答えるまで Manager loop は
止まる (再起動は user の [Apply] 再クリック)。

**Restart recovery** (Fable missing item): Manager PTY session が死んだ
時の再開は Phase 4.2 の scope 外。change の現在 phase を Manager が
起動時に読み、`coded` or `reviewed` から再開する semantics を提案。
詳細は後続 idea note。

**Cancellation**: user が Kanban の該当 job を [Cancel] するか PTY で
Ctrl+C。既存 runner.cancel() 経路そのまま。Manager 側は SIGTERM で
落ちる (child dispatch も逐次終わる — dispatch は同期 blocking で
`AgentRunner.cancel` で子プロセスが SIGTERM)。

### 4. Kanban [Apply] ボタンの経路 (今回 change の scope 外)

現状 [Apply] は `runInject("/opsx:apply add-foo", true)` で PTY に文字列を
送る (`web/src/components/Kanban.tsx` の startImplementation 経由)。

**Phase 4.2 では [Apply] の挙動を変えない**。User は手動で
`/opsx:manage add-foo` を PTY に打つことで Manager loop を試せる。

将来の `add-agents-yaml-migration` で:
- `agents.yaml` の default agent の initialInput を `/opsx:manage ...` へ
- Kanban [Apply] は変えない (agents.yaml が真実の source)

### 5. Documentation

`docs/2026-07-11-manager-usage-and-agents-migration.md` を新規作成:
- Manager の起動方法 (現状は手動 `/opsx:manage <id>`)
- agents.yaml に review-claude / verify-claude / code-claude を追加する
  手順
- Runtimes.claude runtime を書く例
- 移行 timeline (add-agents-yaml-migration に前倒すか、user 判断で個別
  試す形か)

## Fable review 対応

- **HIGH #1**: Manager loop は Bash + curl で明示、slash command は
  prompt template
- **HIGH #4**: Phase 2+3+4 大 merge の bisect story — Phase 4.2 完了時に
  main merge 判断
- **MEDIUM #5**: Phase 4 を 4.1 (workers) + 4.2 (Manager) に分割済
- **MEDIUM #6**: verify Node 決め打ち → 4.1 で明記済、idea note で
  addressing
- **Missing #convergence-guard**: MAX_ITERATIONS = 5 を hard-code + idea
  note で config 化
- **Missing #restart-recovery**: 起動時 phase 検査で継続可能、詳細は idea
  note
- **Missing #cost-tracking**: Phase 4.2 scope 外、Phase 5 or 別 change

## Out of scope

- **agents.yaml migration** — 別 change `add-agents-yaml-migration` で書く
- **Kanban [Apply] 経路の変更** — agents.yaml migration とセット
- **Manager cost tracking** — Phase 5 or 別 change
- **Manager cancellation UI 改善** — 既存 cancel で十分、後で見直し
- **Restart recovery の詳細実装** — 現状 "phase を見て再開" を prompt に
  埋め込むだけ、専用 endpoint は作らない
- **Configurable maxIterations** — Phase 4.2 hard-code、idea note で
  config 化

## Impact

- 新規 `.claude/commands/opsx/manage.md` (~180 LOC)
- 新規 `.claude/commands/opsx/code.md` (~90 LOC)
- 新規 `docs/2026-07-11-manager-usage-and-agents-migration.md` (~120 LOC)
- 新規 `docs/ideas/2026-07-11-manager-max-iterations-config.md` (~30 LOC)
- 新規 `docs/ideas/2026-07-11-verify-command-per-project.md` (~30 LOC、
  Phase 4.1 の Fable MEDIUM #6 対応)
- Spec delta: 2 ADDED requirements
- Tests: slash command 追加のみ、code 変更なし → tests 234 維持
- Backward compat: 100% (追加のみ、agents.yaml 変更なし)
