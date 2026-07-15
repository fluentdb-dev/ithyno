---
date: 2026-07-15
status: idea
tags: [architecture, feature/agents, area/server, area/skills, simplification]
source: conversation
related:
  - docs/ideas/2026-07-06-cross-agent-messaging.md
  - docs/2026-07-07-phase-3-through-6-decomposition.md
  - openspec/changes/archive/2026-07-11-add-runtime-abstraction/
  - openspec/changes/archive/2026-07-11-add-dispatch-endpoint/
  - openspec/changes/archive/2026-07-11-extend-agent-job-model/
promoted_to: null
---

# Runtime layer を mode-dispatch に折り畳んで薄くする

Phase 3–5 で積んだ multi-agent runtime (dispatch endpoint / agent job
model / runner subprocess / PTY manager / worktree pool / runtime
detection) は、single-user + Claude 経由の実利用パターンだと大部分が
Claude 側の能力 (Task tool, skills, bash) の再実装になっている。
`agents.yaml` の schema だけ残せば、実行は agent 側 (Claude / agmsg
peer) に返せる、というのが本 idea の骨子。

## 現状の複雑さの出所

- **dispatch endpoint** (`selectAgent` + role / specialty / runtime
  filter) — Claude が自身の判断で skill を呼び分ければ済む
- **agent job model** (jobs テーブル / broadcast / lifecycle) — Claude
  は自分で status を語れる、UI は file watcher で十分
- **runner subprocess + PTY manager** — Task tool と PTY (agmsg or
  local shell) が既に存在
- **worktree pool** — agent 側が `git worktree add` すればいい
- **runtime detection** — agmsg / claude が `which` で解決できれば十分
- **session_id UUID の CLI 別配線** — agmsg thread id or Claude session
  id をそのまま使えばいい

## 提案する mental model

`mode` フィールドを「呼び出し方の宣言」に純化する:

```
agents.yaml (UI が call target を知るための declaration)
  ├── mode: single-prompt  →  Task tool 経由 (subagent, headless, 1-shot)
  └── mode: live-shell     →  agmsg 経由 (peer shell, 双方向, 永続 session)
```

- **single-prompt** = "Claude に対する Task 呼び出し"。prompt を注入して
  結果を待つ。ithyno server は spawn しない、Claude が Task tool で回す
- **live-shell** = "agmsg team room への参加"。peer が SQLite で送受信、
  ithyno server は agmsg CLI を起動するだけ (or 起動もしない)

Manager 概念は agmsg の team room 上の role として自然に還元される。

## 折り畳めるもの / 残るもの

### 折り畳める (server から消える or optional 化)

- `server/agents/dispatch.ts` — `selectAgent` は Claude 側で判断
- `server/agents/pty.ts` (runner PTY) — agmsg が持つ
- `server/agents/pool.ts` (WorktreePool) — agent 自身が git worktree
- `server/agents/registry.ts` の runtime detection / specialty matcher
- `agents.yaml` schema: `concurrency` / `dedicated` / `specialties` /
  `runtime` の block — mode 二値 + name + command で足りる
- `runtimes:` block と runtime inheritance — agmsg 統合前提なら不要

### 残す (dashboard-first UX を支える薄い部分)

- `agents.yaml` 読み込み + broadcast (`chokidar` + WS)
- Agents tab / Manager section (declaration の visual 表示)
- Kanban Start ボタン → "Claude prompt injector" or "agmsg send"
- change / spec / archive の read-only browser (今のまま)
- worktree の read view (存在すれば diff 表示、無ければ何も出さない)

## agmsg promotion trigger としての位置付け

`docs/ideas/2026-07-06-cross-agent-messaging.md` は
「Phase 3 core には組み込まない、Phase 4+ で peer 通信要件が固まったら
promotion 検討」と保留していた。本 idea は **live-shell = agmsg** の
1:1 対応を提案しているので、この方向に舵切るなら agmsg idea を promote
して `add-agmsg-integration` change を先に通す必要がある。

## 撤退の段階案 (実装時の草案)

1. **agmsg 統合を promote** (前提)
   - `add-agmsg-integration` を propose、`mode: live-shell` の裏を
     agmsg に付け替える。旧 PTY runner path は fallback として残す
2. **schema slim 化** を propose
   - `concurrency / dedicated / specialties / runtime` を deprecated 化
   - UI の Agent Config Modal から該当フィールドを外す
3. **runtime detection を Task-tool + agmsg check の 2 個に狭める**
4. **dispatch endpoint を "prompt inject / agmsg send" の 2 branch に
   縮約** (`role` は Claude 側判断に返す)
5. **WorktreePool 撤退** — agent 側で `git worktree add`
6. **agent job model を read-only broadcast (file-watcher) 化**

各段階が独立に revert 可能なので、Phase 6 (escalation UI) と並行しても
矛盾しない。

## 想定される反論と応答

- **「dashboard-first UX が壊れる」** — Kanban / Agents tab / Change
  browser は残るので視覚的価値は保存される。Start ボタンの裏側だけ
  差し替わる
- **「Claude 経由じゃない user はどうする」** — agmsg peer 側 (Codex /
  Gemini CLI 等) は agmsg team room に自分で入る前提。ithyno は yaml
  で名前を知ってるだけ
- **「無くしたら過去の change が壊れる」** — spec.md は残るので history
  は保存される。撤退した capability は revert 手順 (revert-\* change) で
  cleanly 消せる

## ExecutionPicker (terminal vs worktree) も config に落とす

現状の `ExecutionPicker` は Start する度に "Terminal (Claude 共有 session)"
と "Worktree (isolated · parallel-safe)" を選ばせている。これは実質
「並列を有効にするか」の 1 択なので、**Config で 1 回決めさせて picker を
消す** のが素直:

```
Settings / agents.yaml (project-wide preference):
  parallelExecution: true   # → worktree mode (agent branch + isolated dir)
  parallelExecution: false  # → terminal mode (shared main working tree)
```

- `proposal.execution` (change 単位の上書き) は残す — たまに例外したい時用
- picker は無くなり、Start 押した瞬間 config の値で分岐
- ChangeDetail の Start ボタンも同じ挙動

## Terminal branch = "Claude skill 呼び出し" として統一

現状は "Terminal" branch が PTY に `/opsx:apply` を inject する専用実装
になっているが、そもそも Claude 起動を前提にしている以上、これは
**「claude skill (`/opsx:*`) を呼ぶ」だけ** で足りる。UI 上も「terminal」
という手段名を出さず、**skill 名で語る** ように統一する:

```
Before:
  [ Terminal ]  Claude auto-resumed · shared session
  [ Worktree ]  isolated · parallel-safe

After (parallelExecution = false):
  Start → /opsx:apply <change-id> を Claude に送る
After (parallelExecution = true):
  Start → agent (mode=single-prompt: Task, mode=live-shell: agmsg) 起動
```

つまり mode collapse (single-prompt = Task, live-shell = agmsg) と
組み合わせると:

- `parallelExecution: false` → Claude 本体に `/opsx:apply` を送るだけ
  (今の terminal branch と等価)
- `parallelExecution: true` + `mode: single-prompt` → Claude が Task tool
  で subagent を worktree に起こす
- `parallelExecution: true` + `mode: live-shell` → agmsg peer を team
  room に起こす

runtime layer は「どこに prompt を投げるか」の 3 分岐に縮約される。
今の PTY runner / dispatch endpoint / worktree pool を廃した後の姿。

## 次の一歩

本 idea は stage ① で保存。実装着手前に:

1. `add-agmsg-integration` の propose (Phase 4+ の promotion)
2. その後、本 idea を promote して `collapse-runtime-to-mode-dispatch`
   change として詳細設計 (ExecutionPicker → config + terminal-branch を
   skill call に統一を含む)
3. 段階的撤退 change を順次 propose

Phase 6 (escalation) はこの方向とも矛盾しないので現状のまま進行可。
