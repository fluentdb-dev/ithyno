---
title: Multi-agent CLI 互換一覧 (claude / copilot / agy / codex)
date: 2026-07-15
status: settled
audience: user, agents.yaml を書く人
---

# Multi-agent CLI 互換一覧

ithyno の runner は agents.yaml の `command` を `child_process.spawn`
で headless に起動します (`mode: single-prompt` の場合)。resolved
prompt は `promptStyle: cli-arg` の時 args 末尾に `[promptFlag,
prompt]` を自動 append。**CLI ごとに `-p` の有無・session-id 対応が
違う** ため、ここに主要 4 CLI をまとめておきます。

## 対応早見表

| CLI | non-interactive 実行 | session-id | 権限 auto-approve | ithyno 標準 config で動くか |
|---|---|---|---|---|
| **claude** (Anthropic Claude Code) | `-p, --print <prompt>` | `--session-id <uuid>` (**UUID 必須**) | `--dangerously-skip-permissions` | ✅ そのまま動く |
| **copilot** (GitHub Copilot CLI) | `-p, --prompt <text>` | `--session-id <id>` (UUID 想定) | `--yolo` (`--allow-all` alias) | ✅ そのまま動く |
| **agy** (Antigravity) | `-p` = `--print`、`--prompt` alias | `--conversation <id>` (`-c`/`--continue` で最新) | `--dangerously-skip-permissions` | ✅ そのまま動く |
| **codex** (OpenAI Codex) | **`codex exec [PROMPT]`** サブコマンド+位置引数 | `codex exec resume <SESSION_ID> [PROMPT]` | `--dangerously-bypass-approvals-and-sandbox` | ⚠️ **要 workaround** (下記) |

## claude 標準 config 例

```yaml
- name: claude
  mode: single-prompt
  roles: [code]
  command: claude
  args: [--dangerously-skip-permissions, --session-id, "${session_id}", --model, sonnet]
  prompts:
    code: /ithy-opsx:apply ${change_id}
```

runner が append: `claude ... -p "/ithy-opsx:apply <change_id>"`。
`${session_id}` は `.ithyno/sessions.json` から change 単位で
mint・永続化された UUID (`add-session-id-template-var` 参照)。

## copilot 標準 config 例

```yaml
- name: copilot-review
  mode: single-prompt
  roles: [review]
  command: copilot
  args: [--yolo, -s, --session-id, "${session_id}"]
  prompts:
    review: /opsx:review ${change_id}
```

`-s, --silent` で agent 応答のみ出力、`--yolo` で権限確認スキップ。
runner が `-p "/opsx:review <change_id>"` を append。

## agy 標準 config 例

```yaml
- name: agy-worker
  mode: single-prompt
  roles: [code]
  command: agy
  args: [--dangerously-skip-permissions, --model, "gpt-4o"]
  prompts:
    code: /opsx:apply ${change_id}
```

agy の `--conversation <id>` は現状 ithyno の `${session_id}` (UUID)
と直接互換ではなく、agy 独自 ID を期待する可能性あり。試す場合は
`agy --conversation` の受入形式を確認してから追加してください。

## codex — workaround 必要

codex は他と違って **`-p` フラグを持たず**、`codex exec [PROMPT]` の
**サブコマンド + 位置引数** で prompt を渡します。ithyno runner の
auto-append は `-p <prompt>` を末尾に付ける仕様なので、そのままだと
`codex exec ... -p "..."` になって codex に unknown flag として蹴られる
可能性があります。

### workaround A: `runtimes:` block を使う

```yaml
runtimes:
  codex:
    command: codex
    baseArgs: [exec, --dangerously-bypass-approvals-and-sandbox]
    promptStyle: cli-arg
    # promptFlag を敢えて設定しない → runner は末尾に prompt をそのまま追加
    supports:
      interactive: false
      artifactOutput: true
      diff: git

agents:
  - name: codex-worker
    mode: single-prompt
    roles: [code]
    runtime: codex
    prompts:
      code: /opsx:apply ${change_id}
```

これで `codex exec --dangerously-bypass-approvals-and-sandbox
"/opsx:apply <change_id>"` として spawn されます (`-p` なし)。

### workaround B: prompts をあきらめて args に埋める

```yaml
- name: codex-worker
  mode: single-prompt
  roles: [code]
  command: codex
  args:
    - exec
    - --dangerously-bypass-approvals-and-sandbox
    - /opsx:apply ${change_id}   # ← 位置引数として prompt を埋め込む
  # prompts.code を **設定しない** — runner の auto-append を回避
```

`${change_id}` は args template 置換で解決。`prompts:` を設定しないと
`isExplicitPrompt=false` になり runner は追加しません (legacy escape
hatch)。

### workaround C: session を扱うなら resume を使う

codex は session を `codex exec resume <SESSION_ID> [PROMPT]` で
resume します。current session の resume を毎回したい場合は runtime か
args で `exec resume ${session_id}` を組み立てる形になりますが、初回
起動時に session が存在しないと codex がエラーを返すので、
「ithyno 側で session の初回作成 → 保存 → 以降 resume」というフロー
はまだ ithyno は面倒を見ていません。**codex + session_id 統合は
現状 out-of-scope**、必要なら別 propose ください。

## session_id template variable の意味

`${session_id}` は「change 単位で mint・永続化された **UUID**」です
(`add-session-id-template-var`)。

- 同じ change を何度 dispatch しても同じ UUID
- サーバー再起動を跨いでも保持 (`.ithyno/sessions.json`)
- CLI 別 session store は独立 → 同 UUID を claude・copilot 両方に
  渡しても「会話が共有」されるわけではない (namespace が同じだけ)

## multi-agent (multi-role) dispatch の考え方

現状の runner:

- 1 change = 1 active job (change-lock)
- 1 agent = 1 or 多数 role (`roles: [code, review, verify]` 可)
- dispatch endpoint は `{ role, changeId }` を受けて `agents.roles`
  contains-check + specialties + runtime filter でエージェント選択

### パターン 1: 1 CLI が全 role を担当

```yaml
- name: claude-all
  mode: single-prompt
  roles: [code, review, verify]
  command: claude
  args: [--dangerously-skip-permissions, --session-id, "${session_id}"]
  prompts:
    code: /opsx:apply ${change_id}
    review: /opsx:review ${change_id}
    verify: /opsx:verify ${change_id}
```

Kanban から dispatch は sequential (code → review → verify)。同じ
change なので同じ session_id が全部に渡り、Claude Code の会話も
連続 (claude 側の `--session-id` resume 機能で継続)。

### パターン 2: role ごとに違う CLI

```yaml
- name: claude
  mode: single-prompt
  roles: [code]
  command: claude
  args: [--dangerously-skip-permissions, --session-id, "${session_id}"]
  prompts: { code: /opsx:apply ${change_id} }

- name: copilot-review
  mode: single-prompt
  roles: [review]
  command: copilot
  args: [--yolo, -s]
  prompts: { review: /opsx:review ${change_id} }
```

役割ごとに違う CLI を dispatcher が自動選択。session_id は各 CLI が
独自解釈 (claude の session ≠ copilot の session)。

## 制約 (現状)

- **change-lock**: 同じ changeId に同時 dispatch すると 2 回目は 409。
  例: code が走ってる最中に review を start しても失敗。code の
  完了を待つ必要あり。
- **concurrency field は未 enforce**: `agents.yaml` の `concurrency:
  N` は Phase 1 で入れた schema 予約領域で、現在 runner は無視
  ([`docs/ideas/2026-07-14-concurrency-field-hidden-pending-enforcement.md`](ideas/2026-07-14-concurrency-field-hidden-pending-enforcement.md))
- **runtime detection**: `command:` パスは `which` で解決確認。
  agents タブの `Runtimes` セクションで `installed: true/false` を
  表示 ([Phase 3.3](../openspec/changes/archive/2026-07-11-add-runtime-detection/))

## 関連

- `add-runtime-abstraction` (Phase 3.1) — `runtimes:` block の初出
- `reshape-agents-yaml-mode-roles` — `mode` + `roles[]` + `prompts{}`
  への collapse
- `add-session-id-template-var` — `${session_id}` UUID 化
- `add-agents-broadcast-on-file-event` — agents.yaml 変更の live 反映
- `docs/2026-07-11-manager-usage-and-agents-migration.md` — Manager 設定
