---
status: idea
tags: [feature/agents, feature/review, area/server, phase-3.5]
source: conversation
related:
  - docs/2026-07-06-manager-loop-observation-mechanism.md
  - docs/2026-07-06-phase-2-implementation-and-redesign.md
external:
  - https://github.com/ProxyAyush/antigravity-fusion-plugin
  - https://openrouter.ai/blog/announcements/fusion-beats-frontier/
promoted_to: null
---

# Fusion runtime for review (Antigravity Fusion 統合)

Review role の robustness を上げるために、`antigravity-fusion-plugin` の
「複数 model に並列に問い、judge が synthesize する」パターンを、
Ithyno の runtime 抽象化の枠内で **optional runtime として組み込む**。

Phase 3 core (dispatch + runtime abstraction + config UI) が動いた後、
Phase 3.5 で `add-fusion-runtime-support` として promotion する。

## Antigravity Fusion とは

- OpenRouter の「Fusion beats Frontier」パターンの local 実装
- 1 つの prompt を N 個の model に **並列で問う**
- Judge model が答えを synthesize して 1 つの return
- Sub-agent は `--print` (`-p`) mode で **read-only advisor** (workspace
  を書き換えない)
- Judge model = 現 CLI session の active model
- Antigravity CLI / Claude Code / Codex で動く
- `/fusion <task>` で invoke、`~/.fusion_panel_prefs.txt` で panel 設定

Ithyno 目線での要点:

- `--print` mode で走る sub-agent は既存の worktree pool の使い方と親和
- 「judge = 現 CLI」= Manager が judge を兼ねる pattern が可能
- Cost が model 数に比例、default 化には向かない
- Review 用途で使うと **verdict の信頼性が定量的に上がる** (期待値)

## Ithyno runtime abstraction との整合

前 turn で決めた `agents.yaml` の runtime 抽象化にそのまま乗せられる:

```yaml
runtimes:
  claude:
    command: claude
    baseArgs: [--dangerously-skip-permissions]
    promptStyle: cli-arg
    promptFlag: -p
    supports: { interactive: true, artifactOutput: true, diff: git }

  fusion-review:
    command: fusion             # antigravity-fusion-plugin の CLI
    baseArgs:
      - --panel
      - "claude-sonnet-4-6,gemini-3.5-flash,codex-o1"
      - --judge
      - claude-opus-4-7
    promptStyle: cli-arg
    supports:
      interactive: false
      artifactOutput: true       # judge が review.md を書ける
      diff: none
    costMultiplier: 3            # panel 3 model 分の cost

agents:
  - role: review
    runtime: fusion-review       # ← default review を fusion に置き換え
    promptTemplate: |
      Review the diff for change ${change_id}.
      Panel members: analyze the diff independently.
      Judge: synthesize verdict and write to
      openspec/changes/${change_id}/review.md with frontmatter
      { verdict: pass | needs-rework, findings: [...] }.
    outputPolicy:
      writesArtifact: true
      artifactName: review.md
```

**変更は runtime 定義の追加と `role: review` の 1 行 rewrite のみ**。前 turn で
決めた architecture がそのまま活用できる。

## 適用場面と選択肢

### 案 A: default review を fusion に

- 全 change の review が panel + judge で走る
- 質向上は最大、cost も最大 (毎 review で 3x)
- 小さい project では過剰

### 案 B: specialty で分岐 (推奨)

```yaml
agents:
  - role: review
    runtime: claude
    specialties: [any]              # default は single-model review
  - role: review
    runtime: fusion-review
    specialties: [critical]         # 重要 change だけ fusion
```

Change の proposal frontmatter で `tags: [critical]` を付けると fusion が
選ばれる。**選択は user (proposal 書く人)**、default は cheap review。

### 案 C: Manager 判断で dispatch 時に指定

- `/opsx:dispatch review add-foo --high-confidence` のような flag
- Ithyno server が該当 runtime を選ぶ
- Manager (claude) が「これは重要そう」と判断した時のみ fusion
- Runtime 選択が dispatch 単位で動く → 前 turn の「user は role まで」と
  ずれる。**採用しない**

**推奨: 案 B (specialty で自動分岐)**。User は tag 付けの意思決定だけで済む。

## 他 role への展開検討

### code role で fusion

- 複数 candidate 実装を並列生成、judge が best を選ぶ
- **Not recommended**: 各 candidate が worktree に別々の diff を作るので
  文脈が乱れる。judge も full impl を read しないと選べない → 実質 review
  段階と重複
- Fusion は「advice を集約」に強く、「artifact を選ぶ」には不向き

### manager role で fusion

- Manager 自身が判断を fusion する
- **Not recommended**: Manager は 1 個の常駐 session。Fusion に置き換えると
  interactive PTY の性質が壊れる (fusion は `--print`)
- Manager 内で **必要な時だけ** `/fusion <question>` を呼ぶ形は OK

### verify role で fusion

- Test 実行や build 検証を N 回並列で verify する
- 冗長、単発 test で足りる
- **Not recommended**

**結論: review role に絞る**。他 role への展開は effort に見合わない。

## Cost と可視化

Ithyno は runtime に `costMultiplier` を持たせて可視化:

- Agents タブの Live section で `● review (fusion-review) · panel: 3 · 4m`
- 完了時に total cost 表示 (option、model 別 cost DB が必要)

将来的に「予算内で fusion を許すか」を Config UI で調整可能に:

```yaml
runtimes:
  fusion-review:
    costCeiling: 0.10             # 1 dispatch 上限 (USD)
    fallback: claude              # 予算超過時の fallback
```

## Phase 3 での扱い

- **組み込まない** (core dispatch が動く前に fusion を組むと debug 困難)
- 本 idea note を保存、`add-runtime-abstraction` が landed してから
  promotion

## 変換規則 (promoted 時)

Idea → change 化する条件:

- Phase 3 の `add-runtime-abstraction` + `add-dispatch-endpoint` が landed
- `antigravity-fusion-plugin` の CLI 側 stability (breaking change の頻度)
  を確認
- User が「review の信頼性が足りない」を訴える

Promotion 時に本 idea の frontmatter を更新:

```
status: promoted
promoted_to: openspec/changes/add-fusion-runtime-support/
```

## 参考

- antigravity-fusion-plugin README (2026-07-06 時点):
  https://github.com/ProxyAyush/antigravity-fusion-plugin
- Fusion beats Frontier (OpenRouter):
  https://openrouter.ai/blog/announcements/fusion-beats-frontier/
- Commands: `/fusion <task>`, `/fusion:setup`, `/fusion:config`
- Config: `~/.fusion_panel_prefs.txt` or `.fusion.json` (repo-governed)
