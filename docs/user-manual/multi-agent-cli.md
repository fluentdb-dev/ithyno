---
title: エージェント設定 — 対応 CLI と agents.yaml
audience: end-user
---

# エージェント設定 — 対応 CLI と agents.yaml

このページでは ithyno の Kanban から dispatch される「ワーカーエージェント」を
`agents.yaml` にどう書くかを、CLI 別 (claude / copilot / agy / codex) にまとめます。

対象 CLI:

- **claude** — Anthropic Claude Code
- **copilot** — GitHub Copilot CLI
- **agy** — Antigravity CLI
- **codex** — OpenAI Codex CLI

## Quick start

1. リポジトリ直下 `agents.yaml` を開く (無ければ Agents タブから作成)
2. 使いたい CLI が `which <cli>` で解決できることを確認
3. 下記「CLI 別テンプレート」から該当ブロックをコピペ
4. 保存すると Agents タブに即反映される (リロード不要)

## 対応早見表

| CLI | non-interactive 実行 | session-id | 権限 auto-approve | そのまま動くか |
|---|---|---|---|---|
| claude | `-p, --print <prompt>` | `--session-id <uuid>` (UUID 必須) | `--dangerously-skip-permissions` | ✅ |
| copilot | `-p, --prompt <text>` | `--session-id <id>` (UUID 想定) | `--yolo` (`--allow-all` alias) | ✅ |
| agy | `-p` / `--prompt` | `--conversation <id>` (`-c`/`--continue` で最新) | `--dangerously-skip-permissions` | ✅ |
| codex | `codex exec [PROMPT]` (サブコマンド+位置引数) | `codex exec resume <ID> [PROMPT]` | `--dangerously-bypass-approvals-and-sandbox` | ⚠️ workaround あり |

## agents.yaml の基本形

```yaml
- name: <任意の識別名>          # UI に表示される
  mode: single-prompt          # ヘッドレスで 1 プロンプト実行
  roles: [code]                # このエージェントが受け付ける role
  command: <CLI 実行ファイル名>
  args:
    - <CLI 固有 flag>
  prompts:
    code: <role=code 時に渡される prompt>
```

`prompts.<role>` に書いた文字列は runner が `-p <prompt>` として自動で args 末尾に
append します (`promptStyle: cli-arg` の場合)。CLI 側が `-p` を持たない場合は
「codex 節」を参照。

## CLI 別テンプレート

### claude (code role)

```yaml
- name: claude
  mode: single-prompt
  roles: [code]
  command: claude
  args:
    - --dangerously-skip-permissions
    - --session-id
    - ${session_id}
    - --model
    - sonnet
  prompts:
    code: /opsx:apply ${change_id}
```

- `${session_id}` は change 単位で発行される UUID (下記「セッションの扱い」)
- `--model sonnet` を外すと Claude Code のデフォルトモデルが使われる

### copilot (review role)

```yaml
- name: copilot-review
  mode: single-prompt
  roles: [review]
  command: copilot
  args:
    - --yolo         # 権限確認スキップ
    - -s             # silent: agent 応答のみ出力
    - --session-id
    - ${session_id}
  prompts:
    review: /opsx:review ${change_id}
```

### agy (code role)

```yaml
- name: agy-worker
  mode: single-prompt
  roles: [code]
  command: agy
  args:
    - --dangerously-skip-permissions
    - --model
    - gpt-4o
  prompts:
    code: /opsx:apply ${change_id}
```

agy の `--conversation <id>` は agy 独自 ID フォーマットを期待する可能性があるため、
ithyno の `${session_id}` (UUID) をそのまま渡すのは非推奨です。使う場合は
`agy --conversation` の受入形式を確認してから。

### codex

codex は他 CLI と違い **`-p` フラグを持たず**、`codex exec [PROMPT]` の
サブコマンド + 位置引数で prompt を渡します。ithyno は `command: codex` を
専用処理し、解決したプロンプトを自動的に `codex exec <prompt>` へ変換します。
Codex以外のCLIにはClaudeと同じ `-p <prompt>` 形式を使用します。

通常は `agents.yaml` に `exec` やプロンプトを明記する必要はありません。

```yaml
- name: codex-worker
  mode: single-prompt
  roles: [code]
  command: codex
  args:
    - --dangerously-bypass-approvals-and-sandbox
```

ビルトインの `code` プロンプトを使う場合、次のように起動されます。

```text
codex --dangerously-bypass-approvals-and-sandbox exec "openspec-apply <change_id>"
```

`runtimes:` blockを使う場合も同じ変換が適用されます。

```yaml
runtimes:
  codex:
    command: codex
    baseArgs:
      - --dangerously-bypass-approvals-and-sandbox
    promptStyle: cli-arg
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

プロンプトを `args` に直接埋め込む既存設定も重複挿入されず、そのまま維持されます。

```yaml
- name: codex-worker
  mode: single-prompt
  roles: [code]
  command: codex
  args:
    - exec
    - --dangerously-bypass-approvals-and-sandbox
    - /opsx:apply ${change_id}   # ← 位置引数として prompt を埋め込む
  # 既存のプロンプト引数が検出されるため、ビルトインは重複挿入されない
```

`${change_id}` は args template でも置換されます。

> **codex + session resume は未対応**: `codex exec resume <SESSION_ID>` を使う
> フローは初回の session 作成を ithyno 側で面倒みる必要があり、現状はサポート外です。

## セッションの扱い

`${session_id}` は「同じ change に対して発行される固定 UUID」です。

- 同じ change を何度 dispatch しても同じ UUID
- サーバー再起動を跨いでも保持
- **CLI ごとの session store は独立** — 同じ UUID を claude と copilot 両方に渡しても
  会話が共有されるわけではなく、単に同じ ID 空間を指すだけ

つまり同じ change での複数 dispatch は claude なら resume され、
copilot なら copilot 内で resume される、というだけの話です。

## multi-role 設定

1 つのエージェントに複数 role を持たせるパターンと、role ごとに CLI を分けるパターン
の 2 通りがあります。

### パターン 1: 1 CLI が全 role を担当

```yaml
- name: claude-all
  mode: single-prompt
  roles: [code, review, verify]
  command: claude
  args:
    - --dangerously-skip-permissions
    - --session-id
    - ${session_id}
  prompts:
    code: /opsx:apply ${change_id}
    review: /opsx:review ${change_id}
    verify: /opsx:verify ${change_id}
```

Kanban から順次 dispatch (code → review → verify)。全部同じ session_id なので
Claude Code 側で会話が繋がる。

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

dispatcher が role に応じて自動選択します。

## 制約と注意点

- **同一 change の同時 dispatch は不可**: 例えば code が走ってる最中に review を
  start しようとすると 409。code の完了を待つ必要があります。
- **`concurrency:` フィールドは現状 UI schema のみで無視されます**: 将来的な
  enforcement は未実装。
- **CLI が PATH に無いと dispatch 失敗**: Agents タブの Runtimes セクションで
  `installed: true/false` を確認できます。

## プロジェクトローカルのスキル設定とインストール

Prerequisites（前提条件）セクションでは、Agent CLI の実行バイナリ自体の検出に加えて、プロジェクトに適用されている **OpenSpec および ithyno スキルのインストール状態** を検査・管理できます。

### 前提条件と認証の分離
- **重要**: スキルのインストールと、Agent CLI 自体のインストール・認証は **完全に別個の前提条件** です。
- 設定画面の `Manage skills` からプロジェクトにスキルファイルを配置できますが、これによって `claude` などの Agent CLI そのものがインストールされたり、ベンダー固有の認証（`gcloud auth`、`gh auth` 等）が自動で行われたりするわけではありません。エージェントを動かすには、インストールされた CLI がシステム上で使用可能かつ認証済みである必要があります。

### スキルの検査とインストール
Settings の Prerequisites テーブルで各 Agent CLI の `Manage skills` をクリックするとダイアログが表示されます：
- **OpenSpec**: プロジェクトルートへ指定された CLI 用の OpenSpec アダプター（`.claude/commands/opsx/` や `.agent/workflows/` など）を配置します。
- **ithyno skills**: クロスCLIの共通スキル仕様（`SKILL.md` など）をプロジェクトへレンダリング・配置します。
- ダイアログ上で、インストールされる対象のプロジェクトローカル相対パスの一覧（Target paths）を確認した上でインストールを実行できます。

## 関連ページ

- [エージェントのロール](./agents-and-roles.md) — code / review / verify / manager の使い分け (未整備)
