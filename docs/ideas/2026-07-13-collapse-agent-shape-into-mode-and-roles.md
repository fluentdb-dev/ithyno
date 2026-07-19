---
status: promoted
tags: [area/config, area/web, area/server, feature/agents-yaml, phase-5]
source: conversation
related:
  - openspec/changes/archive/2026-07-XX-add-runtime-abstraction
  - openspec/changes/refine-agents-config-modal
  - openspec/changes/add-modal-command-picker-and-presets
  - docs/ideas/2026-07-13-agent-roles-user-manual-entry.md
promoted_to: openspec/changes/reshape-agents-yaml-mode-roles/
---

# Collapse `shape: legacy|runtime-backed` into `mode` + `roles[]`

Phase 3.1 で `runtimes:` ブロックと Runtime-backed shape を導入したが、
Modal を実装してユーザーテストしてみると **shape は「宣言方法の差」でしか
分かれておらず、ユーザーが本当に選びたい「行動の差 (single-prompt vs
live-shell)」を露出できていない** ことが判明した。前ターンの `initialInput`
が Runtime-backed shape でも表示されるバグは、まさにその歪みが表面化した
もの。

## 現状の 2 shape

| Shape | 中身 | Runner の扱い |
|---|---|---|
| Legacy | `command + args + initialInput` を直書き | `-p <initialInput>` を先頭に unshift（promptStyle: cli-arg 前提） |
| Runtime-backed | `runtime: <name> + prompt` — command/baseArgs/promptStyle/promptFlag は `runtimes:` ブロックから解決 | `runtimes:` block の promptStyle に従う |

問題:

1. **User-facing で 2 shape を意識する意味がない** — どちらも最終的には
   同じ「spawn + prompt 注入」に落ちる
2. **Manager と Worker の真の差 (PTY interactive vs headless spawn) が
   shape に直接マップされていない** — Legacy でも Manager が書ける、
   Runtime-backed でも Worker が書けるという直交関係
3. **role が single-value** — 同じ CLI で code / review / verify を全部
   こなせるのに、3 つ agent を declare する必要がある

## 提案スキーマ

```yaml
runtimes:                        # optional; デフォルト値の shortcut
  claude:
    command: claude
    args: [--dangerously-skip-permissions]
    promptFlag: -p               # single-prompt の時に unshift される
    prompts:                     # role → デフォルト prompt
      code: "/opsx:apply ${change_id}"
      review: "/opsx:review ${change_id}"
      verify: "/opsx:verify ${change_id}"
      manager: "/opsx:manage"

agents:
  - name: claude-worker
    runtime: claude              # optional; runtimes: の値を継承
    mode: single-prompt          # single-prompt | live-shell
    roles: [code, review, verify]

  - name: claude-manager
    runtime: claude
    args: [--continue]           # runtime の args を上書き
    mode: live-shell
    roles: [manager]
    prompts:
      manager: "/opsx:manage"    # runtime の default を上書きしてもよい
```

### 行動の差 (mode)

- **`single-prompt`** — spawn → `promptFlag <resolved-prompt>` を先頭
  unshift → 出力を capture → exit（現 Worker 相当）
- **`live-shell`** — PTY で spawn → boot 後に `<resolved-prompt>` を
  stdin にタイプ → 生かしっぱなし（現 Manager 相当）

### 複数 role の解決

dispatch endpoint が `role=X` を要求してきたら、`roles` に `X` を含む
agent の中から specialty score 最大のものを選ぶ。prompt 解決順:

1. agent 自身の `prompts.<role>`
2. `runtimes.<runtime>.prompts.<role>`
3. Built-in default（`role → /opsx:<skill> ${change_id}`）

## この形にすると起きる変化

1. **`shape` toggle が UI から消える** — mode の 2 択 + roles の
   multi-select だけ
2. **Preset の意味が変わる** — 「preset 適用ボタン」ではなく
   `runtimes:` に定義された既知の CLI を選ぶだけで args + prompts が
   継承される。add-modal-command-picker-and-presets の実装形が変わる
3. **1 agent で 3 roles を担う書き方が自然になる** — agents.yaml が
   短くなる (`claude-worker` 1 entry で code+review+verify)
4. **既存 config との後方互換** — 現行の Legacy / Runtime-backed 両方
   を parse-time で新形式に normalize して読む

## 気になる点

- **既存の runtimes: ブロックの位置づけ** — 廃止するのではなく、
  「複数 agent が共有するデフォルト値の置き場所」として残す。
  agent 側で全部書けば `runtimes:` は不要、共有したければ書く、という
  optional な立場に
- **`live-shell` + `roles: [code]` の組み合わせ** — 現 Manager は
  特殊扱いだが、この形にすると「対話モードで人が code role を動かす」
  も表現できてしまう。制約を入れるか (`roles` が `[manager]` のみの
  時だけ `live-shell` 許可) は要検討。案：許可する（人間が code を
  対話でやりたいユースケースは実在する）
- **prompt template 変数** — `${change_id}` 以外に何を渡すか。現状は
  runner が build する。この機会に `${worktree_path}` や
  `${branch}` も追加できる

## 次のステップ

1. このファイルを idea として commit
2. `propose reshape-agents-yaml-mode-roles`（あるいは適切な id）で
   MODIFIED delta を書く。対象 spec: dashboard の agents-yaml 関連
   requirements
3. add-modal-command-picker-and-presets はこの提案を待って、preset の
   形を新スキーマに合わせて書き直す（今の proposal は Legacy 前提で
   設計されている）
4. 後方互換 loader を server 側に追加する change を別出しにするか
   同じ change に含めるかは、propose 時に判断

## 関連

- `docs/ideas/2026-07-13-agent-roles-user-manual-entry.md` — role
  vocabulary の user-facing docs。この提案が landing したら
  「1 agent が複数 role を持てる」という記述を追加する必要がある
- `openspec/changes/add-modal-command-picker-and-presets/` — preset
  設計は新スキーマに合わせて書き直す前提
