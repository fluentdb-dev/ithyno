# クライアント別 Skill 統合ガイド

この文書は、ithyno と OpenSpec の Skill を Claude Code、Codex、
Antigravity（`agy`）、Copilot などへ配布・実行する過程で得られた知見を
まとめたものです。

## 1. 正規ソースと生成物

ithyno Skill の編集元は次の CLI 中立ソースです。

```text
ithyno/skills/<skill-id>/
├── SKILL.md
└── manifest.yaml
```

Claude の既存コマンドを挙動上の基準としながら、CLI 固有のファイルは
renderer が生成します。`.claude/commands/`、`.codex/`、`.agent/` などの
生成物だけを個別に修正してはいけません。共通の意味変更は
`ithyno/skills/`へ反映し、CLI 差分はrendererで表現します。

Skill本文では、CLI固有のツール名を直接埋め込む代わりに、必要に応じて
capability tokenを使用します。定義は
[`docs/skill-capabilities.md`](./skill-capabilities.md)を参照してください。

## 2. Command、Prompt、Workflow、Skillの違い

Command、Prompt、Workflowは、主にユーザーが処理を開始する入口です。
Skillは、エージェントが手順と判断基準を発見するための定義です。

入口ファイルが存在しても、対応するSkillが発見可能とは限りません。
逆に、Skillだけを配置しても、クライアント固有のコマンド一覧には表示されない
場合があります。dispatchのようにユーザーと内部Workerの両方から利用する機能は、
対象クライアントに応じて両方の成果物が必要です。

```text
ユーザー入力
  -> Command / Prompt / Workflow
  -> Skillの処理契約
  -> ManagerまたはWorker
```

## 3. クライアント別の配置と呼び出し

| クライアント | ithynoの入口 | 補助Skill・Rule | 代表的な呼び出し |
|---|---|---|---|
| Claude Code | `.claude/commands/<namespace>/<command>.md` | 既存のClaude Skillは`.claude/skills/` | `/ithy-opsx:dispatch change-id` |
| Codex | `.codex/prompts/<namespace>-<command>.md` | 必要なshimは`.codex/skills/<name>/SKILL.md` | `ithy-opsx-dispatch change-id` |
| Antigravity / agy | `.agent/workflows/<namespace>-<command>.md` | `.agent/skills/`、`.agent/rules/` | `/ithy-opsx-dispatch change-id` |
| Copilot | `.github/prompts/`など | `AGENTS.md`、`.github/copilot-instructions.md` | クライアント固有のPromptまたは自然言語 |

### 3.1 Claude Code

Claude rendererは次の形式を生成します。

```text
.claude/commands/ithy-opsx/dispatch.md
```

Claudeでは`/namespace:command`形式を使用できます。子エージェント委譲には
ClaudeのTask/Agent Toolを使用できます。

`.claude/commands/`はコマンド入口、`.claude/skills/`はSkill定義です。
両者を同じものとして扱わないでください。

### 3.2 Codex

CodexにはClaudeの`/namespace:command`構文をそのまま渡しません。
rendererはコマンド参照を次のように変換します。

```text
/opsx:apply              -> openspec-apply-change
/opsx:propose            -> openspec-propose
/ithy-opsx:dispatch      -> ithy-opsx-dispatch
```

ithynoの入口と単一dispatchの発見用shimは次の場所です。

```text
.codex/prompts/ithy-opsx-dispatch.md
.codex/skills/ithy-opsx-dispatch/SKILL.md
```

一方、現在のOpenSpec公式Codex Skillは`.codex/skills/`ではなく、次の共有
Skill領域へ配置されます。

```text
.agents/skills/openspec-propose/SKILL.md
.agents/skills/openspec-apply-change/SKILL.md
.agents/skills/.openspec-target  # 値: codex
```

したがって、「Codexのファイルはすべて`.codex/`にある」という前提は誤りです。
OpenSpecとithynoそれぞれのインストーラーが採用する実際の配置を検査する必要が
あります。

変換先のSkill名が存在しない場合、Codexは文字列を自然言語として即興解釈する
可能性があります。過去には`openspec-apply`へ変換していたため、実装だけでなく
archiveやspec同期まで行うscope overrunが起きました。変換先は必ず実在する正確な
名前、現在は`openspec-apply-change`にします。

code Workerには名前だけでなく、次のscope contractも渡します。

- tasksの実装だけを行う。
- archiveやspec同期を行わない。
- pushやmergeを行わない。
- 指定された成果物とcommit契約を守る。

CodexではClaudeのTask Tool相当を前提にせず、ネイティブ委譲が利用できない場合は
AgentRunner経由のsubprocessを使用します。

### 3.3 Antigravity / agy

agyのディレクトリは複数形の`.agents`ではなく、単数形の`.agent`です。

```text
.agent/
├── workflows/
├── skills/
└── rules/
```

agyはflatなWorkflow名を発見するため、Claude形式から次のように変換します。

```text
/ithy-opsx:dispatch -> /ithy-opsx-dispatch
/opsx:apply         -> /opsx-apply
```

dispatchでは、同一CLIのWorkerをManager自身が実装してしまわないよう、次のRuleも
生成します。

```text
.agent/rules/ithy-opsx-dispatch.md
```

選択されたagy Workerに`invoke_subagent`が利用できる場合は、必ずそれを呼び出します。
ManagerがWorkerの仕事を直接実行してはいけません。`invoke_subagent`が利用不能または
明示的に失敗した場合だけAgentRunnerへフォールバックし、直接`agy -p`のargvを
組み立てません。

### 3.4 Copilot

Copilot系では、すべての環境がClaudeやCodexと対称なSkill発見機構を提供するとは
限りません。このプロジェクトではWorkerの共通契約を次へ配置します。

```text
AGENTS.md
.github/copilot-instructions.md
```

これらには、code、review、verifyの役割境界、worktree、commit、成果物、禁止操作を
記述します。クライアント固有Skillが利用できない場合でも、この契約を安全網として
使用します。

## 4. OpenSpecとithynoの名前空間

### `/opsx:` — OpenSpec単体

`propose`、`apply`、`archive`、`explore`、`revert`、`sync`などを提供します。
ithyno Dashboard、`agents.yaml`、worktree管理には依存しません。

### `/ithy-opsx:` — ithyno連携

`dispatch`、`review`、`verify`、`merge`などを提供します。Manager/Worker構成、
`agents.yaml`、worktree、Dashboardのフェーズ更新、`review.md`などの成果物契約を
扱います。

標準のWorker割り当ては次のとおりです。

```text
code   -> OpenSpec apply
review -> ithyno review
verify -> ithyno verify
```

CLIごとに構文を変換しても、各Workerは1回の起動につき1つの役割だけを実行します。

## 5. インストール状態の判定

「生成処理を実行した」「入口ファイルがある」「Skillとして認識された」は別の状態です。
検査はクライアント別の期待ファイルに対して行います。

- OpenSpecはOpenSpecインストーラーが生成する現在のlayoutを検査する。
- ithynoはrendererが生成するファイルの存在と内容一致を検査する。
- PromptやWorkflowだけでなく、必要なSkillやRuleも検査する。
- CLI実行ファイルの存在をSkillインストール成功の代わりにしない。
- 複数の有効なlayoutがある場合は、legacyとcurrentを明示的に区別する。

ElectronとVS Code拡張では、`ithyno/skills/`がパッケージへ同梱されていなければ
期待ファイル数が0となり、`unsupported`と誤判定されます。prepackのコピー対象と
bundle検証もインストールテストの一部です。

## 6. initializeとManage Skills

initializeまたはSettingsのManage Skillsは、対象CLIごとに次を行います。

1. OpenSpec公式の初期化処理を対象CLI向けに実行する。
2. `ithyno/skills/`から対象rendererで成果物を生成する。
3. Command、Prompt、Workflow、Skill、Ruleを必要な場所へ配置する。
4. 実際の出力を再検査する。
5. `missing`、`partial`、`installed`、`update-available`、`unsupported`を区別する。

SkillはプロジェクトとCLI種別で共有されるため、同じ`command`を使う複数の
`agents.yaml`エントリごとではなく、CLI種別ごとに管理します。

## 7. dispatchの実行環境

Skillからithyno APIを呼び出す場合、固定ポートを使用してはいけません。
Managerセッションへ注入された次の値を使用します。

```text
ITHYNO_BASE
ITHYNO_PORT
ITHYNO_SESSION_TOKEN
ITHYNO_PROJECT_ROOT
```

実行時の原則は次のとおりです。

- `ITHYNO_BASE`を最優先する。
- `ITHYNO_BASE`がなく`ITHYNO_PORT`がある場合だけ、その値からURLを構築する。
- default portや推測したportへ無言でfallbackしない。
- API呼び出しの直前に、現在の環境変数が最新か自問して再展開する。
- 401、403、接続失敗時は一度だけ環境を読み直し、値が実際に変わった場合だけ再試行する。
- Tokenの値をログへ出さない。
- launcher専用TokenをManagerやWorkerへ継承しない。
- `ITHYNO_PROJECT_ROOT`と実行対象のproject rootを照合する。

tmuxではSkillが後から環境を推測するのではなく、tmuxセッションの作成・再接続時に
Dashboardの環境変数を明示的に注入します。

## 8. 回帰テストで守るもの

最低限、次を自動テストします。

- 各rendererの正確な出力path。
- Claude、Codex、agyそれぞれのコマンド参照変換。
- Codexの`openspec-apply-change`への正確な変換。
- Codex単一dispatch SkillとPromptの両方の生成。
- agyの`.agent`使用と`.agents`からのmigration。
- agy dispatch Ruleと`invoke_subagent`契約。
- OpenSpecとithynoの個別インストール状態。
- packageされたElectronとVS Code拡張への`ithyno/skills/`同梱。
- 一時プロジェクトでのSkill smoke test。

## 9. 実装判断の要約

- Claudeの既存挙動を意味上の基準にする。
- 編集元はCLI中立な`ithyno/skills/`へ集約する。
- クライアント固有構文はrendererで生成する。
- Command/Prompt/WorkflowとSkillを混同しない。
- Codexだけスラッシュなしの名前へ変換し、変換先の存在を保証する。
- agyは`.agent`と`invoke_subagent`を使用する。
- Skill未発見時に自然言語の即興実行へ進ませない。
- Worker promptへ役割、成果物、禁止操作を明示する。
- API endpointとTokenはセッション環境から受け取り、固定値を持たない。
