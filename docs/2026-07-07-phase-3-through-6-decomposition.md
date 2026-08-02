---
title: Phase 3〜6 の decomposition (Manager 前提の再構成)
date: 2026-07-07
status: settled
audience: 次 session 以降の実装、および別 agent レビュー用
supersedes: docs/2026-07-06-phase-2-implementation-and-redesign.md の §5.3, §11 (Phase 3 の 12 change 分割案)
related:
  - docs/2026-07-06-phase-2-implementation-and-redesign.md
  - docs/2026-07-06-manager-loop-observation-mechanism.md
  - docs/ideas/2026-07-06-cross-agent-messaging.md
  - docs/ideas/2026-07-06-fusion-runtime-for-review.md
tags: [phase-workflow, manager, roadmap, phase-3, phase-4, phase-5, phase-6]
---

# Phase 3〜6 の decomposition

Phase 2 の revert 完了 (`revert-active-phase-ui` archived) を受けて、
Phase 3 以降の change 群を **user-visible milestone 単位** で 4 phase に
再構成する。前 doc の「Phase 3 = 12 change」は大きすぎ、また Manager 本体
(`/opsx:apply` の prompt engineering と worker skill) が漏れていた。

## 1. 全体像

```
Phase 2 (現状 phase-workflow に居る、17 commits ahead of main)
  └─ substrate + Kanban monitor + spec + tests
  ⇒ Phase 3+4 完了まで main への merge を保留

Phase 3: Manager 用の底面 (5 change)
  └─ runtime abstraction + dispatch endpoint + review artifact
  ⇒ Milestone: /opsx:dispatch code add-foo が terminal から叩ける (dev-only)

Phase 4: Manager 本体 (1 change)
  └─ manager loop の prompt + worker skills (/opsx:review /opsx:verify)
  ⇒ Milestone: /opsx:apply add-foo が code→review→verify を通し切る

──── ここで Phase 2+3+4 まとめて main に merge (production 可) ────

Phase 5: 観測 UI (3 change)
  └─ Agents タブ live panel + config UI + config write
  ⇒ Milestone: User が fleet を Agents タブから触れる

Phase 6: 通知チェーン (4 change)
  └─ escalation broadcast + PTY auto-focus + desktop notifications + bell
  ⇒ Milestone: needs-human 発生時に User が確実に気付く

──── 実用フル装備 ────

Optional (時期未定):
  Phase 3.5: Fusion runtime for review (docs/ideas に既存)
  Phase 4+:  agmsg 統合 (docs/ideas に既存)
  Phase 7:   reserved-phase (validated/verified) 廃止 or gate 導入
```

## 2. Phase 2 の main merge タイミング

**保留**: Phase 2 単独で main に merge しない。

理由:

- Phase 2 の landed UI は「phase を持つカードを phase lane に表示する」だけ。
  Manager が居ないと phase 遷移が起きず、User の主観では「カードが
  proposed lane に貼り付いたまま」で壊れているように見える
- Phase 3+4 完了で `/opsx:apply` が実際に phase を進めるようになって初めて
  User に価値が届く
- `phase-workflow` branch を維持し、Phase 3+4 完了時に **17 + Phase 3+4
  の commit** をまとめて main に merge する

**例外**: Phase 2 の backend + docs だけを別 branch `phase-2-substrate-only` に
cherry-pick して main に届ける選択肢はある (UI を含めない)。今のところ却下。

## 3. Phase 3: Manager 用の底面

**Goal**: Manager (Phase 4) が呼び出す下側の infrastructure を全て揃える。

### 3.1 Change 一覧 (5 件)

| # | Change | 概要 | 依存 |
|---|---|---|---|
| 3.1 | `add-runtime-abstraction` | `agents.yaml` に `runtimes:` section を導入。`command / baseArgs / promptStyle / promptFlag / supports` を宣言。既存 `args:` 前提の agent と共存 (後方互換) | 単独可 |
| 3.2 | `add-dispatch-endpoint` | `POST /api/agents/dispatch` route + `/opsx:dispatch` slash command。role / change-id を渡して worker を spawn、job 完了まで block、artifact + verdict summary を text return | 3.1 |
| 3.3 | `add-runtime-detection` | `which <cmd>` で runtime install 状況を判定、`GET /api/agents/runtimes` を追加 | 3.1 |
| 3.4 | `extend-agent-job-model` | `JobSummary` に `role / runtime / verdict / artifacts` フィールド追加。既存 endpoint の response 拡張 | 3.1, 3.2 |
| 3.5 | `add-review-artifact` | `openspec/changes/<id>/review.md` の schema (frontmatter で `verdict: pass | needs-rework` + `findings: [...]`)、parser、`GET /api/agents/jobs/:id/verdict` endpoint | 3.4 |

### 3.2 Phase 3 完了時に動くこと

Terminal で以下が叩ける (Manager 前だが dev として test 可):

```bash
# runtime detection
curl localhost:4321/api/agents/runtimes
# → [{name:"claude",installed:true,...}, {name:"aider",installed:false,...}]

# 手動 dispatch
/opsx:dispatch code add-foo
# → runtime: claude, agent: code-claude, status: completed,
#    artifacts: [], stdout: "..."

# Review dispatch
/opsx:dispatch review add-foo
# → runtime: claude, verdict: {kind: "needs-rework", findings: [...]},
#    artifacts: [openspec/changes/add-foo/review.md]
```

Kanban 側は phase 変化を反映するのみ (自動 dispatch はまだ入らない)。

### 3.3 Phase 3 実装順の依存グラフ

```
3.1 (runtime-abstraction)  ← 単独スタート
   ↓
3.2 (dispatch-endpoint)   3.3 (runtime-detection)
   ↓                              ↓
3.4 (job-model) ←──────────────────┘
   ↓
3.5 (review-artifact)
```

3.1 が最初、3.2 と 3.3 が並列可能、3.4 は両方の後、3.5 が最後。

## 4. Phase 4: Manager 本体

**Goal**: `/opsx:apply` を Manager loop 化して end-to-end で動く状態にする。

### 4.1 Change (1 件だが実質は skill 3 つ)

| # | Change | 内容 |
|---|---|---|
| 4.1 | `add-manager-prompt-and-skills` | 3 skill を新設 or 既存を rewrite |

内訳:

- **`.claude/skills/opsx-manager/SKILL.md`** (新規) — Manager の behavior 定義
  - `/opsx:apply <id>` が起動時に proposal / tasks / specs を read
  - `/opsx:dispatch code` → `/opsx:dispatch review` の loop
  - Verdict `needs-rework` なら prompt_suffix に findings を入れて code 再 dispatch
  - Verdict `pass` なら verify に進む
  - `verify` 通ったら phase: done へ更新して exit
  - 途中で判断不能なら `/ithy-opsx:escalate` (これも新設) で `phase: needs-human` に

- **`.claude/commands/opsx/review.md`** (新規) — Review worker slash command
  - Worker 側で prompt を組み、diff を読み、`review.md` を書く
  - Manager が `/opsx:dispatch review` 経由で呼ぶ

- **`.claude/commands/opsx/verify.md`** (新規) — Verify worker slash command
  - `npm test && npm run typecheck && npm run build` を worktree で実行
  - 結果を verdict として return

- **`.claude/commands/opsx/escalate.md`** (新規) — Escalation caller
  - Manager が呼ぶ、`POST /api/changes/:id/needs-human`
  - PTY 経由で User に見せる ($n Phase 6 の notification chain と接続)

- **既存 `.claude/skills/ithy-opsx-apply/SKILL.md`** — 差し替え or 併存判断
  - 現行は 1-shot 実装。Manager 対応版と別 name (`ithy-opsx-manage`?) にして両立するか、上書きするかは実装時判断

### 4.2 Phase 4 完了時に動くこと

Kanban で `+ New Change` → proposal 作成 → `[Apply]` ボタン →
`/opsx:apply add-foo` が PTY で走る → Manager が dispatch loop を回し、
最終的に `phase: done` に到達。User は Kanban lane 移動を目視できる。

## 5. Phase 5: 観測 UI

**Goal**: Agents タブから fleet 設定と稼動状況を触れる。前 doc §7 の
「Agents タブは config + live のみ」方針を実装。

### 5.1 Change 一覧 (3 件)

| # | Change | 概要 |
|---|---|---|
| 5.1 | `add-agents-tab-live-panel` | Agents タブ左に Live section (実行中 agent + click で live stdout drill-in) + Configured section (idle) + Runtimes section | 3.3, 3.4 |
| 5.2 | `add-agents-config-ui` | 同タブ下部に Role → Runtime editor + Prompt template editor + Save button | 3.1 |
| 5.3 | `add-agents-config-write` | `POST /api/agents/config` で `agents.yaml` yaml round-trip 保存、CSRF + isLocal ガード | 5.2 |

### 5.2 依存

```
Phase 3 完了 → 5.1, 5.2 並列可
5.2 → 5.3
```

## 6. Phase 6: 通知チェーン

**Goal**: `needs-human` 発生時に User が確実に気付く。前 turn の
「Manager 主導 escalation 通知」を実装。

### 6.1 Change 一覧 (4 件)

| # | Change | 概要 | Opt-in |
|---|---|---|---|
| 6.1 | `add-escalation-broadcast` | Server: `escalation-opened` WS event 発火。Client: toast + titlebar 更新 + Kanban badge 強調 | default ON |
| 6.2 | `add-pty-auto-focus-on-escalation` | `escalation-opened` を web が受信したら該当 PTY session を terminal panel の active tab に切替 | default ON |
| 6.3 | `add-desktop-notifications` | Web Notification API 経由の OS 通知 | opt-in |
| 6.4 | `add-escalation-bell` | Audio bell、user gesture 前提の play | opt-in |

### 6.2 依存

Phase 4 完了に依存 (Manager が `phase: needs-human` に上げる主体)。
Phase 6 内では 6.1 → 6.2 → 6.3 → 6.4 の順で有用性が下がるが、各 change
は独立に merge 可。

## 7. Optional / Deferred phases

### 7.1 Phase 3.5 (Fusion runtime for review)

- `docs/ideas/2026-07-06-fusion-runtime-for-review.md` に草案
- Phase 3 の runtime abstraction が landed した後、review の質不足を訴える
  ユーザーが現れた or benchmark で fusion 優位性を確認できた段階で promotion
- Change: `add-fusion-runtime-support`

### 7.2 Phase 4+ (agmsg 統合)

- `docs/ideas/2026-07-06-cross-agent-messaging.md` に草案
- Cross-machine peer / remote review / multi-vendor bench の需要が具体化
  した段階で promotion
- Change: `add-agmsg-integration`

### 7.3 Phase 7 (reserved-phase 廃止 or gate 追加)

- 現状 `RESERVED_PHASES = ["validated", "verified"]` を `POST /phase` で
  400 拒否している
- Manager 前提だと gate agent は agents.yaml に `role: gate-validate` /
  `role: gate-verify` を追加するだけで実現、reserved phase 概念を廃止
  してもよい
- 廃止するなら change: `remove-reserved-phase-gate`
- 温存して gate を追加するなら change: `add-gate-agents`
- 実装タイミングは Phase 6 完了後、User の要望次第

## 8. Merge strategy

### 8.1 Phase 3 完了時

- `phase-workflow` を継続 use、Phase 3 の 5 change を順次積む
- Phase 4 と一緒に main へ merge する前提で、Phase 3 単独 merge はしない

### 8.2 Phase 4 完了時 = 大 merge point

- `phase-workflow` → `main` に **Phase 2 + 3 + 4** をまとめて merge
- 30〜35 commit の大 merge
- 事前に:
  - Manual smoke test (`/opsx:apply add-foo` を新規 change で end-to-end)
  - `main` から `git log --oneline main..phase-workflow` を確認、意図しない commit が混入していないか check
  - `.worktrees/` の cleanup
- `--no-ff` で merge commit 作成

### 8.3 Phase 5, 6 完了時

- Phase 4 merge 後は main-first workflow に戻す (feature branch は各 change
  ごとに worktree)
- Phase 5, 6 は独立に merge

## 9. 次 session の初手

1. **`phase-workflow` の状態確認**
   ```bash
   git checkout phase-workflow
   git log --oneline main..phase-workflow | head -20
   npm test && npm run typecheck && npm run build
   ```

2. **worktree cleanup 判断**
   ```bash
   git worktree list
   # 残骸: add-phase-state-machine, add-kanban-phase-lanes,
   #        add-needs-human-phase, revert-active-phase-ui
   # 掃除するなら:
   # git worktree remove .worktrees/<name>
   # git branch -D agent/<name>
   ```

3. **Phase 3.1 propose 開始**
   ```
   /opsx:propose add-runtime-abstraction
   ```
   もしくは skill 経由で `openspec-propose`:
   - Ithyno の `agents.yaml` に `runtimes:` section を導入
   - `runtimes.<name>.{command, baseArgs, promptStyle, promptFlag, supports}`
   - 既存 `agents[].args` との後方互換 shim
   - `server/agents/registry.ts` の spawn ロジックを runtime lookup 経由へ
   - Tests: 既存 agent の spawn が壊れないこと + runtime 引き当ての unit test

4. **Reviewer round 1 実施可能**
   - 本 doc + `phase-3-6-decomposition.md` を別 agent に read させて審査
   - 特に §4 (Manager 本体を 1 change に押し込むのが妥当か) と §8 (大 merge の
     リスク) について

## 10. Open questions

以下は本 doc で結論を出していない。実装時に判断:

1. **Phase 4 を 1 change に押し込むべきか、skill / command 単位で 3〜4 change
   に分けるべきか**
   - 1 change 派: 単独では動かない依存があるので合わせて出す
   - 分割派: skill / command 単位で review しやすい

2. **`.claude/skills/ithy-opsx-apply/` の扱い**
   - Manager 対応版に上書き → 既存 default agent の behavior 変更
   - 併存 (`ithy-opsx-manage` を新設) → 選択肢が増えて config が複雑化

3. **Phase 3 の `/opsx:dispatch` は同期 API か非同期か**
   - 同期 (Manager が block して結果待ち): 単純、debug しやすい
   - 非同期 (job id を return して polling): 並列 dispatch が楽

4. **Job history の永続化**
   - 現状 in-memory only (server restart で消える)
   - Phase 3 の `extend-agent-job-model` で SQLite or JSONL 永続化を含めるか、
     別 change (`add-job-history-persistence`) に切り出すか

5. **Manager の cost 可視化**
   - `docs/ideas/2026-07-06-fusion-runtime-for-review.md` に `costMultiplier`
     の草案あり
   - Phase 3 で入れるか (fusion 前提で有用) Phase 3.5 に譲るか

以上。

---

## Appendix A: Change 総数まとめ

| Phase | Change 数 | 累計 |
|---|---|---|
| Phase 2 (already done) | 4 archived | 4 |
| Phase 3 | 5 | 9 |
| Phase 4 | 1 (実質 3 skills) | 10 |
| Phase 5 | 3 | 13 |
| Phase 6 | 4 | 17 |
| Phase 3.5 (option) | 1 | 18 |
| Phase 4+ agmsg (option) | 1 | 19 |
| Phase 7 (option) | 1 | 20 |

前 doc の Phase 3 = 12 change を 4 phase に再分配した結果、実装単位は
明確になり、milestone は 4 回訪れる (Phase 3 dev-usable / Phase 4
production-usable / Phase 5 fleet-configurable / Phase 6 notification-full)。
