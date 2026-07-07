---
status: idea
tags: [feature/agents, feature/collaboration, area/server, area/skills, phase-4]
source: conversation
related:
  - docs/2026-07-06-phase-2-implementation-and-redesign.md
  - docs/2026-07-06-manager-loop-observation-mechanism.md
  - docs/ideas/2026-07-04-agent-roles-and-worktree-pool.md
external:
  - https://github.com/fujibee/agmsg
promoted_to: null
---

# Cross-agent messaging (agmsg 統合の検討)

Manager → code → review の pipeline を階層構造で組む Phase 3 の設計とは
別の関心事として、**cross-vendor CLI agent 間の peer 通信** を提供する
`agmsg` (fujibee/agmsg) の統合を将来的に検討する。

Phase 3 の core dispatch (Ithyno の worktree pool + spawn) には組み込まない。
Phase 4+ で「distributed / multi-team / user-in-the-loop peer session」の
要件が固まったら promotion する。

## agmsg とは

- Cross-vendor CLI AI agents (Claude Code / Codex / Gemini CLI / Copilot
  CLI / Antigravity / OpenCode) が **shared SQLite** 経由で peer messaging
- No daemon, no network, no MCP — SQLite ファイルが floor
- Hook / Monitor mode で相手の発言が text として届く
- `send.sh` は SQLite に row を append するだけ
- WAL mode で multi-reader / single-writer
- History は DB に永続化 (session 終了後も残る)
- **明示的に peer 通信であって subagent 関係ではない**
- `spawn` は「新しい peer を別 terminal に起こす」で親子関係を作らない

## Ithyno の Phase 3 設計との相違

| 面 | agmsg | Ithyno Manager 設計 |
| --- | --- | --- |
| モデル | 対等 peers | 階層 (Manager が worker を dispatch) |
| Trigger | 相手が送ったら反応 | Manager の LLM 判断で `/opsx:dispatch` |
| State store | SQLite (message log) | `.openspec.yaml` + worktree + `review.md` |
| History | DB rows | git commits + artifact files |
| 目的 | Cross-vendor **会話** を可能にする | Cross-vendor **作業** を pipeline に組む |

Phase 3 の core (Manager → worker) には次の理由で組み込まない:

1. Ithyno の dispatch はマシン内・階層的、agmsg は peer-to-peer
2. State を SQLite に置くと openspec の disk-based worldview と二重管理
3. Manager loop は「相手が送るのを待つ」ではなく「dispatch → 結果待ち」の
   同期関係、agmsg の非同期 monitor は不要

## 有用な場面 (Phase 4+ で promotion 検討)

以下の要件が固まった段階で agmsg を optional integration として組み込む
候補:

### A. Remote peer review

- Manager が「別マシンで走ってる Codex に review してもらう」
- Team room 経由で question を投げ、返事を待って verdict に反映
- 例: 社内で複数拠点があり、各拠点の main developer が peer reviewer 兼任

### B. Cross-machine change coordination

- 複数マシンで独立に change を進めている状態を、Manager 同士が共有
- 「add-foo は machine-A で done、machine-B は merge 待ち」を team room で
  同期
- Ithyno の Kanban を横断的に見る需要が出た時の手段

### C. User self-peer session

- User が別 terminal で `claude` を起動し、Manager と peer として会話
- 「今どこまで進んだ？」を interactive に問い合わせる
- 現状の PTY panel 直接接続で足りるが、agmsg 経由なら terminal に縛られない

### D. Multi-vendor bench mark

- 同じ change を Claude Code / Codex / Gemini CLI で並列に走らせ、agmsg
  で結果を集約
- どの vendor が最も良い実装を出したかを比較
- Antigravity Fusion (別 idea note で議論) と組み合わせも可

## 統合形態 (Phase 4+ で promotion 時の草案)

Phase 3 完成後、agmsg を Ithyno から optional に呼べる形にする案:

```yaml
# agents.yaml (Phase 4 で追加検討)
agmsg:
  enabled: false                  # default off
  team: openspec-ui-team
  role: manager                   # このマシンの Manager が team room に載る名前
  storage: ~/.agents/agmsg.sqlite

agents:
  - role: peer-review
    runtime: agmsg                # ← 新 runtime
    peers: [codex-alice, gemini-bob]  # team room で名指し
    promptTemplate: |
      Please review the diff for ${change_id}.
      Reply with { verdict: pass|needs-rework, findings: [...] }.
    timeout: 900                   # 15 分
```

Manager 側の使い方:

```
/opsx:dispatch peer-review add-foo
→ agmsg 経由で team room に投稿
→ codex-alice / gemini-bob が返事
→ Ithyno が collect して verdict にまとめる
→ Manager に text return
```

Fallback: peer が応答しない / timeout → local review runtime に切り替え。

## Phase 3 での扱い

- **組み込まない**
- 本 idea note を保存し、Phase 4+ で「peer 通信が要件化した時」に
  `add-agmsg-integration` として propose に promotion
- 現状の `frontmatter.status: idea` を維持

## 変換規則 (promoted 時)

Idea → change 化する条件:
- 上記 A〜D のいずれかが具体的な user story として上がる
- Phase 3 の Manager loop が安定稼働している (core が動く前に足すと debug 困難)
- SQLite ファイルの location / permission / concurrency の運用が固まる

Promotion 時に本 idea の frontmatter を更新:
```
status: promoted
promoted_to: openspec/changes/add-agmsg-integration/
```

## 参考

- agmsg README (2026-07-06 時点): https://github.com/fujibee/agmsg
- Delivery modes: `monitor` (real-time push) / `turn` (polled)
- Supported agents: Claude Code, Codex, Gemini CLI, GitHub Copilot CLI,
  Antigravity, OpenCode, Hermes
- Install: `npx agmsg` or `/plugin marketplace add fujibee/agmsg`
