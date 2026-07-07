---
title: Manager loop の cycle / trigger / 観測 mechanism と agmsg 判断
date: 2026-07-06
status: design-explanation
audience: Phase 3 実装前の設計確認
related:
  - docs/2026-07-06-phase-2-implementation-and-redesign.md
  - docs/ideas/2026-07-04-agent-roles-and-worktree-pool.md
  - openspec/specs/dashboard/spec.md
tags: [phase-workflow, manager, agents, chokidar, observability]
---

# Manager loop の cycle / trigger / 観測 mechanism

Phase 2 substrate が landed した状態を前提に、user が `/opsx:apply` を叩いてから
`Manager → code → review` の cycle がどう回るか、何を観測点として使うか、および
inter-agent messaging (`agmsg` 相当) が必要か否かをまとめる。

## 1. 前提の整理

### 1.1 既存 (Phase 1〜2 で landed 済み)

- `agents.yaml` に `role` / `specialties` / `dedicated` フィールド
- Worktree pool (`WorktreePool`) — dedicated=false の agent は `pool-N/` を共有
- `AgentRunner` — `claude -p` を child process で spawn、stdout / exit code 管理
- Chokidar watcher — `.md` + `.openspec.yaml` を tracked、外部編集で `change-updated` を WebSocket broadcast
- Phase sidecar (`.openspec.yaml` の `phase:` key) の read/write モジュール
- `POST /api/changes/:id/phase` の CSRF-guarded route
- `needs-human.md` artifact スキーマ + escalation/answer API + editor fallback

### 1.2 Phase 3 で追加予定 (未実装)

- Manager loop (常駐 in-process object)
- `agents.yaml` の宣言的 trigger table:
  - `trigger.onPhase: <phase>` — この phase 遷移で Manager が dispatch
  - `onSuccess.setPhase: <phase>` — job が成功したら phase を書き戻す
  - `onFailure.setPhase: <phase>` — 失敗時
  - `onNeedsRework.setPhase: <phase>` — review verdict が needs-rework の時
- `review.md` artifact スキーマ (verdict + findings)
- `GET /api/agents/manager` — Manager 状態 endpoint

## 2. サイクルの全体像

User が `/opsx:apply` (ダッシュボードの Apply ボタン) を叩いた瞬間から DONE 到着までのタイムライン:

| 時刻  | Actor           | アクション                                                       | Mechanism           | 観測点                                    |
| ----- | --------------- | ---------------------------------------------------------------- | ------------------- | ----------------------------------------- |
| t0    | User (ithyno)   | `+ New Change` → proposal 完成                                  | REST + git          | Kanban PROPOSED lane                      |
| t0    |                 | (または `/opsx:propose` を terminal で)                          | openspec CLI        |                                           |
| t0    | User (ithyno)   | `[Apply]` クリック → `POST /api/changes/:id/phase {phase: "proposed"}` | Fastify route  | (状態変化はまだ無し)                      |
| t0+   | fsevent         | `.openspec.yaml` が触られる                                     | chokidar            |                                           |
| t0+   | Manager         | `change-updated` WS event 受信、`trigger.onPhase: proposed` マッチ | WebSocket           | Agents タブ manager の dispatch log       |
| t0+   | Manager         | `AgentRunner.spawn("impl-claude", id)`                          | 内部 API 呼び出し   | Agents タブ list に impl-claude running   |
| t1    | impl-claude     | worktree pool から pool-N 取得<br>`claude -p /ithy-opsx:apply <id>` 実行 | WorktreePool<br>PTY / stdout | Job detail の stdout tab                  |
| t2    | impl-claude     | tasks を tick、git commit                                       | filesystem          |                                           |
| t2    | impl-claude     | exit 0                                                          | child_process       | AgentRunner: status=completed             |
| t2+   | AgentRunner     | `agents.yaml` の `onSuccess` を読む<br>→ `POST /api/changes/:id/phase {phase: "coded"}` | config<br>Fastify route | Kanban 上でカードが PROPOSED → CODED に移動 |
| t2+   | fsevent         | `.openspec.yaml` 再変更                                         | chokidar            | (次のサイクル起動)                        |
| t2+   | Manager         | `change-updated` WS 再受信、`trigger.onPhase: coded` マッチする review-claude → spawn | WebSocket |                                           |
| t3    | review-claude   | `claude -p /opsx:review <id> --format=json`                     | PTY / stdout        | Job detail の stdout tab                  |
| t4    | review-claude   | worktree の diff を読み `review.md` 書く<br>(verdict, findings) | filesystem          | Job detail の Artifact tab (Phase 3 で追加) |
| t4    | review-claude   | exit 0                                                          | child_process       | Job detail の Verdict tab                 |
| t4+   | AgentRunner     | `review.md` の verdict を parse<br>needs-rework → `POST phase {phase: "coded"}` | Artifact parser<br>Fastify route | CODED に留まる → 次サイクルで impl-claude 再 dispatch |
| t5〜  | Manager         | 再度 `phase: coded` → `impl-claude` (前回の review.md をプロンプトに参照) | (略、収束するまでループ) |                                           |
| tn    | verify-claude   | `reviewed` → `done` で終わる                                   | 同上                | DONE lane に到着                          |
| tn+   | User (ithyno)   | `[Archive]` / `[Merge]` クリック                                | openspec CLI 呼び出し |                                           |

**注意点**:
- User が能動的に触るのは **t0 (Apply)** と **tn+ (Archive / Merge)** の 2 点だけ
- 途中の phase 遷移は全て Manager 主導
- サイクルは needs-rework が発生する限りループする (無限ループ防止は `agents.yaml` の maxIterations 等で別途)

## 3. 4 つの観測 mechanism

Manager loop を成立させる観測経路は 4 種類。それぞれの役割と利点:

### 3.1 `chokidar` file watcher — state の source of truth

| 項目 | 内容 |
| --- | --- |
| 対象 | `.openspec.yaml` (phase)、`.md` (tasks / needs-human / review)、worktree の変更 |
| 通知先 | `server/sync/watcher.ts` → `server/index.ts` の handler → WebSocket broadcast |
| 用途 | Manager がこの WS を subscribe することで phase 変化を観測 |
| 利点 | 状態が全て disk 上に永続化、restart 耐性 100%、agent が exit しても sidecar が真実を保持 |

### 3.2 `AgentRunner` — job lifecycle

| 項目 | 内容 |
| --- | --- |
| 対象 | `AgentRunner` が spawn した child process の start / stdout / exit / crash / orphan |
| 通知先 | WebSocket (`job-updated`)、`GET /api/agents/jobs` |
| 用途 | Manager が subscribe すれば「impl-claude が終わった」を exit code で即座に知れる |
| 利点 | sidecar 経由よりも 1〜数秒早い (ただし phase 更新は sidecar 経由の方が権威的) |

### 3.3 `agents.yaml` の宣言的 trigger table — Manager の意思決定源

| 項目 | 内容 |
| --- | --- |
| 対象 | Phase 3 で追加する `trigger.onPhase` / `onSuccess.setPhase` / `onNeedsRework.setPhase` |
| 用途 | Manager は phase 変化を trigger table と突合して次の dispatch を決める |
| 利点 | Manager 自身のコードが薄い、挙動変更は yaml だけで完結、debug しやすい |

### 3.4 `review.md` / `needs-human.md` 等の artifact — 構造化された成果物

| 項目 | 内容 |
| --- | --- |
| 対象 | `review.md` の verdict (`pass` / `needs-rework`)、`needs-human.md` の question / answer |
| 用途 | AgentRunner が verdict を parse し、phase 書き戻しの分岐に使う |
| 利点 | git 履歴に残る、editor で hand-edit も可能、ithyno UI (Verdict tab / Artifact tab) から見られる |

## 4. Manager の実装形態

### 4.1 推奨: Fastify server と同居する常駐 in-process object

```typescript
// server/manager/loop.ts (Phase 3 で追加予定)
class Manager {
  constructor(
    private agents: AgentRegistry,
    private runner: AgentRunner,
    private watcher: Watcher, // chokidar
  ) {
    this.watcher.on("change-updated", this.onChangeUpdated);
    this.runner.on("job-completed", this.onJobCompleted);
  }

  onChangeUpdated = async (change: Change) => {
    // trigger.onPhase が change.phase と一致する agent を探す
    const candidates = this.agents.list()
      .filter(a => a.trigger?.onPhase === change.phase)
      .filter(a => this.matchesSpecialties(a, change));

    // Guard: 同 change に対して同じ role が既に動いていれば dispatch しない
    if (this.runner.hasActiveJob(change.id, candidates[0].role)) return;

    await this.runner.spawn(candidates[0].name, change.id);
  };

  onJobCompleted = async (job: Job) => {
    // agents.yaml の onSuccess / onFailure / onNeedsRework を読む
    const agent = this.agents.get(job.agentName);
    const outcome = await this.resolveOutcome(job); // review.md の verdict 等を読む
    const nextPhase = agent[outcome]?.setPhase;
    if (nextPhase) {
      await setChangePhase(job.changeId, nextPhase); // 次サイクル起動
    }
  };
}
```

### 4.2 独立 process にしない理由

- Fastify server が chokidar / AgentRunner / WebSocket を既に持っている
- 別 process にすると余計な IPC が必要
- restart 挙動が複雑化する

### 4.3 Claude を Manager にしない理由

- 決定的で監査可能な logic だけで足りる
- LLM 判断は各 role agent (impl / review / verify) に閉じ込める
- 常駐 LLM は cost が高く、debug 性も下がる

### 4.4 Ithyno UI から Manager を観測する経路

- `GET /api/agents/manager` — Manager 状態 (idle / dispatching / last dispatch decision)
- Agents タブの pinned entry で常時表示
- 最近の dispatch 履歴 (時刻 / change / from-phase / to-agent)

## 5. User がやる操作 (最終形)

| ステップ | 場所 | 操作 |
| --- | --- | --- |
| 1. 提案書作成 | ithyno または Terminal | `+ New Change` / `/opsx:propose` |
| 2. 開始 | ithyno | `[Apply]` (PROPOSED lane のカード) |
| 3. 見守り | ithyno | (何もしない、Kanban と Agents タブで観測) |
| 4. 詰まったら | Claude Code | needs-human の `[Open in Claude Code]` |
| 5. 完成 | ithyno | `[Archive]` (DONE lane のカード) |
| 6. 統合 | ithyno | `[Merge]` |

Step 3 の「見守り」中に発生する遷移は全て Manager が回す。User は一切 phase を触らない。

## 6. `agmsg` を利用すべきか

### 6.1 `agmsg` の解釈候補

- **A**: Claude Code の `SendMessage` (agent 間 messaging)
- **B**: 一般用語としての agent-to-agent messaging (message bus)
- **C**: 特定のツール名 (この codebase では未確認)

### 6.2 結論: いずれの解釈でも現状の設計では不要

### 6.3 使わない理由

| # | 理由 | 詳細 |
| --- | --- | --- |
| 1 | State のプライマリソースが既に sidecar | Phase 遷移は disk (`.openspec.yaml`) に書かれ、chokidar が全 subscriber に配る。Message で agent 間に通知する必然性が無い |
| 2 | Agent は state-less な spawn | impl-claude も review-claude も 1 回きりの `claude -p` 呼び出しで exit する。Message を受け取るための「常駐先」がそもそも無い (Manager だけが常駐) |
| 3 | Manager が唯一の subscriber | Chokidar → Manager → dispatch という single-consumer なので、message bus のような fan-out は要らない |
| 4 | Restart 耐性を落とす | Message は生存する常駐 process 前提。Ithyno 再起動時に in-flight message が消える。Disk-based なら再起動しても続きから拾える |
| 5 | Debug 性が下がる | `.openspec.yaml` を見れば「今どの phase」が分かる。Message queue の中を見ないと分からない状態は避けたい |

### 6.4 例外的に検討する場面

| 場面 | 現状の代替手段 |
| --- | --- |
| Agent が長時間かかる job の途中経過を報告したい | 現状の PTY stdout + tasks.md tick で足りる (`add-worktree-tasks-watcher` 由来) |
| Manager が Phase 4 の gate agent と協調する | Phase 4 で gate agent が対話的になるなら再検討、それまで不要 |
| Cross-process / cross-machine 分散 | Ithyno のスコープ外 (local first を優先) |

### 6.5 `SendMessage` (Claude Code) を指している場合の補足

`SendMessage` は同一 Claude Code session 内で agent を継続する用途。Cross-process の agent-to-agent には向かない。`impl-claude` と `review-claude` は別 process なので使えない。

もし別のツール / mechanism を指しているなら、名前を教えてもらえれば具体的に議論できる。

## 7. 要点まとめ

- **Manager は chokidar 経由で `.openspec.yaml` の phase 変化を観測** し、`agents.yaml` の trigger table に沿って dispatch
- **AgentRunner は agent の exit code + artifact (`review.md`) を parse** して phase を書き戻し (次サイクルを起こす)
- **User は 4 step (propose / apply / archive / merge) だけ触り、途中の phase 遷移は Manager 任せ**
- **`agmsg` は不要**: state は disk、通知は chokidar、意思決定は Manager で完結。Message bus を足すと restart 耐性 / debug 性が下がる
- **観測 UI**: Kanban lane (phase 状態) + Agents タブ (job 詳細 + Manager 状態 + verdict + artifact)

## 8. 追加で掘り下げる論点

以下は本 doc の scope 外だが、Phase 3 実装前に決めておきたい:

1. **Manager が同 change に複数 agent を並行 dispatch しないか**
   - 例: `phase: coded` になった瞬間に review-claude と verify-claude が両方 trigger する場合の優先順位
   - 案: `agents.yaml` の並び順を優先度として使う、または `after: <role>` フィールドを導入

2. **`review.md` の schema**
   - JSON にすべきか、frontmatter + markdown にすべきか
   - 現状 `outcome.md` / `needs-human.md` は markdown 揃えなので同じ流儀が read しやすい
   - AgentRunner の parse コストとのトレードオフ

3. **needs-human 発生時の Manager の挙動**
   - 該当 change は phase: needs-human に入り、trigger.onPhase: needs-human にマッチする agent は原則無し
   - Manager は「無反応」で正解 (user が Claude Code で解決するまで待つ)
   - Editor fallback で phase が priorPhase に戻った瞬間から再開する

4. **無限ループ防止**
   - impl → review needs-rework → impl → review needs-rework の無限ループ
   - `agents.yaml` に `maxIterations` を書けるようにする案
   - 上限到達で phase を `needs-human` に自動遷移させる (`review.md` を `needs-human.md` に転記)

5. **Manager の restart 挙動**
   - Ithyno 再起動時、in-flight job があればどうする
   - 案: `orphan-worktree-adoption` (Phase 1 由来) と同じ扱い、Manager が起動時に既存 phase 状態を全 scan して整合を取る

以上。
