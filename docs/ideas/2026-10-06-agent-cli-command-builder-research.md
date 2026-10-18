---
date: 2026-10-06
status: promoted
tags: [agents, cli, command-builder, models, settings]
source: local-cli-research
related:
  - openspec/changes/add-agent-cli-command-builder/
promoted_to: openspec/changes/add-agent-cli-command-builder/
---

# Agent CLIのモデル・引数調査とCommand Builder方針

## 目的

Agent設定の`Args (whitespace-separated)`を、Claude Code、Codex、Antigravity CLI
（`agy`）、GitHub Copilot CLIごとの選択式Command Builderへ置き換えるため、実際に
インストールされているCLIのhelpとモデル列挙経路を調査した。

この文書は2026-10-06時点のローカル調査記録であり、モデル一覧を製品へハードコード
するための資料ではない。モデルの利用可否はCLIバージョン、アカウント、契約、地域、
モデルゲートウェイによって変わる。実装はCLIから取得できる情報を優先し、取得できない
場合は手入力を許可する。

## 調査環境

| CLI | 実行ファイル | 調査時version |
| --- | --- | --- |
| Claude Code | `/opt/homebrew/bin/claude` | `2.1.153` |
| Codex CLI | `/Users/cishihara/.local/bin/codex` | `0.160.1` |
| Antigravity CLI | `/Users/cishihara/.local/bin/agy` | `1.3.0` |
| GitHub Copilot CLI | `/opt/homebrew/bin/copilot` | `1.0.91` |

Copilotは`copilot --version`が`1.0.91`を返した一方、`--no-auto-update`付きの対話画面は
`v1.0.89`と表示した。ランチャーと実際に選ばれたruntimeが異なる可能性があるため、
capability cacheはcommand名だけでなく、解決済み実行ファイルと実際のprobe結果を基準に
する必要がある。

## 実行した確認コマンド

```sh
claude --version
claude --help

codex --version
codex --help
codex exec --help
codex app-server generate-json-schema --out <temporary-directory>

agy --version
agy --help
agy models --help
agy models

copilot --version
copilot --help
copilot help commands
copilot help providers
```

Codexのモデルはapp-serverを`initialize`した後、公式プロトコルの
`model/list`を送信して取得した。単純な`codex models`コマンドは存在しない。

Copilotは対話画面の`/model`も確認したが、この環境では
`Failed to read model provider attribution: Not authenticated`となった。したがって、
Copilotの特定モデル一覧をこの結果から一般化してはならない。

## CLI別の調査結果

### Claude Code 2.1.153

Command Builderの主要候補:

| 設定 | CLI引数 | 値・備考 |
| --- | --- | --- |
| Model | `--model <model>` | aliasまたは完全なmodel名。help例は`sonnet`、`opus`、`claude-sonnet-4-6` |
| Effort | `--effort <level>` | `low`, `medium`, `high`, `xhigh`, `max` |
| Permission mode | `--permission-mode <mode>` | `acceptEdits`, `auto`, `bypassPermissions`, `default`, `dontAsk`, `plan` |
| Bypass permissions | `--dangerously-skip-permissions` | 危険な設定として明示する |
| Fallback model | `--fallback-model <model>` | print modeのみ |
| Budget | `--max-budget-usd <amount>` | print modeのみ |
| Tool allow/deny | `--allowed-tools`, `--disallowed-tools` | 複数値を扱う |

モデル一覧を返す非対話コマンドはhelpから確認できなかった。利用者は対話セッションの
`/model`で確認できる。Builderはモデルを自由入力できるcomboboxにし、静的な一覧を
正解として扱わない。

`-p` / `--print`はAgentRunnerがpromptと共に付与する実行制御であり、Command Builderが
`agents.yaml`へ保存する対象ではない。

### Codex CLI 0.160.1

Command Builderの主要候補:

| 設定 | CLI引数 | 値・備考 |
| --- | --- | --- |
| Model | `-m`, `--model <MODEL>` | `model/list`の`model`値を使用 |
| Profile | `-p`, `--profile <CONFIG_PROFILE_V2>` | Codex設定profile |
| Sandbox | `-s`, `--sandbox <mode>` | `read-only`, `workspace-write`, `danger-full-access` |
| Approval | `-a`, `--ask-for-approval <policy>` | `on-request`, `never` |
| Assisted approval | `--approve-for-me` | workspace-write sandboxで自動review |
| Full bypass | `--dangerously-bypass-approvals-and-sandbox` | 非常に危険な設定として明示する |
| Local model | `--oss`, `--local-provider <provider>` | providerは`lmstudio`, `ollama` |
| Web search | `--search` | Responses web searchを有効化 |

公式app-server schemaに`model/list`が存在し、現在の認証環境では次を返した。

| Model | Default effort | Supported efforts | Multi-agent |
| --- | --- | --- | --- |
| `gpt-6.1-sol` | `low` | `low`, `medium`, `high`, `xhigh`, `max`, `ultra` | `v2` |
| `gpt-6-astra` | `low` | `low`, `medium`, `high`, `xhigh`, `max`, `ultra` | `v2` |
| `gpt-6-sol` | `medium` | `low`, `medium`, `high`, `xhigh`, `max`, `ultra` | `v2` |
| `gpt-6-luna` | `medium` | `low`, `medium`, `high`, `xhigh`, `max` | `v2` |
| `gpt-5.6-sol` | `low` | `low`, `medium`, `high`, `xhigh`, `max`, `ultra` | `v2` |
| `gpt-5.6-terra` | `medium` | `low`, `medium`, `high`, `xhigh`, `max`, `ultra` | `v2` |
| `gpt-5.6-luna` | `medium` | `low`, `medium`, `high`, `xhigh`, `max` | `v1` |

これは調査時点のアカウント固有snapshotである。Builderはapp-serverを初期化し
`model/list`を呼び、返された各modelの`supportedReasoningEfforts`をモデルごとの選択肢に
使用する。app-serverが利用できない場合は手入力へfallbackする。

Codexの`exec`とworker promptはAgentRunnerが構築する。Builderが`exec`やprompt本文を
永続化してはならない。

### Antigravity CLI 1.3.0

Command Builderの主要候補:

| 設定 | CLI引数 | 値・備考 |
| --- | --- | --- |
| Model | `--model <model>` | `agy models`のIDを使用 |
| Effort | `--effort <level>` | `low`, `medium`, `high`, `xhigh`, `max` |
| Mode | `--mode <mode>` | `accept-edits`, `plan` |
| Sandbox | `--sandbox` | boolean flag |
| Bypass permissions | `--dangerously-skip-permissions` | 危険な設定として明示する |
| Agent | `--agent <agent>` | Agy側のAgent名 |
| Print timeout | `--print-timeout <duration>` | print modeの制限時間、`0`は完了まで待機 |

`agy models`は現在の環境で次を返した。

```text
gemini-3.8-flash-high
gemini-3.8-flash-medium
gemini-3.8-flash-low
gemini-3.7-flash-high
gemini-3.7-flash-medium
gemini-3.7-flash-low
gemini-3.6-flash-high
gemini-3.6-flash-medium
gemini-3.6-flash-low
gemini-3.1-pro-high
gemini-3.1-pro-low
claude-opus-5-5-low
claude-opus-5-5-medium
claude-opus-5-5-high
claude-sonnet-5-5-low
claude-sonnet-5-5-medium
claude-sonnet-5-5-high
gpt-oss-120b-medium
```

表示名もtab区切りで返るため、adapterは`id`とlabelの両方を保持できる。コマンドは認証、
network、`~/.gemini`への書き込みを必要とする場合がある。失敗やtimeoutは設定保存を
妨げず、手入力へfallbackする。

`-p` / `--print`とprompt本文はAgentRunnerが付与するためBuilderの保存対象外とする。

### GitHub Copilot CLI 1.0.91

Command Builderの主要候補:

| 設定 | CLI引数 | 値・備考 |
| --- | --- | --- |
| Model | `--model <model>` | `auto`または利用可能なmodel名 |
| Reasoning effort | `--reasoning-effort <level>` | `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` |
| Context | `--context <tier>` | `default`, `long_context` |
| Auto routing | `--auto-tier <preference>` | `efficiency`, `balance`, `intelligence` |
| Mode | `--mode <mode>` | `interactive`, `plan`, `autopilot` |
| Autopilot | `--autopilot` | 自律継続mode |
| Permissions | `--allow-tool`, `--deny-tool`, `--allow-url`, `--deny-url` | 複数指定可能 |
| Full allow | `--allow-all`, `--yolo` | 危険な設定として明示する |
| Ask-user disable | `--no-ask-user` | unattended worker向け |

helpから非対話のモデル一覧コマンドは確認できなかった。対話セッションでは`/model`を
使用する。一方、GitHub公式の
[Copilot CLI command reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference#supported-models)
は`--model`へ渡せるcanonical model IDを公開している。その一覧をmaintainer生成カタログの
候補として収録する。利用可能性はplanやorganization policyに依存し、BYOKでは
`COPILOT_MODEL`等により追加provider/modelも使えるため、Builderは候補へ制限せず任意の
model名を手入力可能にする。

`-p` / `--prompt`はAgentRunnerがworker promptを付与するためBuilderの保存対象外とする。

## Command Builderの実装契約

### 1. Adapterで差分を閉じ込める

CLIごとに次を持つadapterを作る。

- canonical IDとcommand alias
- version/help probe
- model discovery probeとparser
- structured field定義
- `args[]` parser/serializer
- AgentRunner所有の除外引数
- manual fallback説明

help全文を汎用的にフォームへ変換しない。adapterが理解する引数をhelp出力で存在確認し、
インストール版にないfieldだけを無効化する。

### 2. Probeは任意command実行APIにしない

- server側のallow-list済みargvだけをshellなしで実行する。
- timeoutとstdout/stderr上限を設ける。
- timeout時は子processを確実に終了する。
- executable pathとruntime version/probe fingerprintで短時間cacheする。
- clientからprobe argvや任意pathを直接受け取らない。

### 3. 既存`args[]`を壊さない

認識済み引数だけを構造化fieldへ取り込み、それ以外はAdvanced argsとして配列要素単位で
保持する。保存時に未知の引数や値を削除・並べ替えしない。重複した認識済み引数は
勝手に片方を選ばずconflictとして表示する。

現在のUIにある空白splitは、空白を含む値やquoteを壊すためcanonical stateにしない。

### 4. Builderが保存しない引数

次はdispatch時にregistry/runnerが決定するため保存しない。

- Claude/Agy/Copilotの`-p`、`--print`、`--prompt`
- Codexの`exec`とprompt本文
- change ID、artifact contract、worktree cwd
- ithynoが自動生成するrole prompt

### 5. UI

- Command変更後にcapabilityをprobeする。
- Modelは取得成功時もeditable comboboxとし、取得値だけに制限しない。
- reasoning/effortは選択model固有の値が返る場合、その値を優先する。
- permission/sandbox bypassは既定でoffとし、危険性を明記する。
- Advanced argsと、実際に`agents.yaml`へ保存するargv previewを表示する。
- 未対応commandでは現在と同等のmanual args編集を残す。

## テスト観点

- 各CLIの記録済みhelp/model出力fixtureをadapter parserへ入力する。
- CLI未インストール、未認証、network failure、timeout、巨大出力を確認する。
- modelの更新や未知model名を保存できることを確認する。
- 既存の未知引数、`--flag=value`、繰り返し引数、空白を含む値をround-tripする。
- Builder保存後もAgentRegistryがpromptを一度だけ追加することを確認する。
- Windowsの`.exe`/`.cmd`解決とprocess terminationを確認する。

## 結論

モデル一覧の取得方法は統一できない。現時点ではAgyは`agy models`、Codexはapp-serverの
`model/list`を利用できる。一方、Claude CodeとCopilotは対話`/model`または手入力を
基本とする。したがってCommand Builderは「静的catalog」ではなく、CLI adapterによる
capability probe、account-aware discovery、manual fallbackを組み合わせるべきである。
