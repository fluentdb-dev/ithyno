---
date: 2026-07-16
status: promoted
tags: [architecture, feature/agents, area/skills, multi-cli, question]
source: conversation
related:
  - docs/ideas/2026-07-15-runtime-collapse-to-mode-dispatch.md
  - .claude/commands/opsx/manage.md
  - .claude/commands/opsx/code.md
  - .claude/commands/opsx/review.md
promoted_to: openspec/changes/wire-role-to-cli-in-manager-skill/
---

# Manager loop skill から role→CLI マッピングをどう尊重するか

## Context (project 側の前提)

**ithyno** は OpenSpec ("spec-driven change" ワークフロー) を支援する
ローカル dashboard。`openspec/changes/<id>/{proposal,tasks,specs}.md`
を編集して段階的に変更を進める。各 change には自動化された workflow
がある:

```
proposed → coded → reviewed → done
```

これを回すのが **Manager loop**。Manager は code worker と review
worker を交互に呼び出し、review verdict が `pass` になるまで反復する
(MAX_ITERATIONS=5)。

### 直近の pivot: runtime-collapse

以前は "Phase 3" として server-side に runtime abstraction layer
(`AgentRuntime` interface, `POST /api/agents/dispatch` endpoint,
in-memory JobRegistry) を持ち、UI から dispatch chain を制御していた。
これは Claude 自身が既に Task tool / skills / bash を持っているのに
それを二重実装している構造で、R1-R9 の revert で剥がした。

結果:
- **Kanban Start button** = 1 change に 1 agent (code role) を server-side で
  spawn する single-agent flow。`agents.yaml` の `roles: [code]` を読んで
  該当 CLI (`command` + `args`) を子プロセスとして起動する。
- **Multi-agent orchestration** = Claude Code の **skill (slash command)
  レイヤー** に責任移譲。`/opsx:manage <id>` がその skill。

### 現在の agents.yaml

```yaml
agents:
  - name: claude
    mode: single-prompt
    roles: [code]
    command: claude
    args: [--dangerously-skip-permissions, --model, sonnet]
    prompts:
      code: /ithy-opsx:apply ${change_id}

  - name: pptr
    mode: live-shell
    roles: [manager]
    command: claude
    args: [--resume, <session-uuid>]

  - name: copilot-review
    mode: single-prompt
    roles: [review]
    command: copilot
    args: [--yolo, -s]
    prompts:
      review: /opsx:review ${change_id}
```

ユーザ意図:
- code role → **claude CLI** (sonnet)
- review role → **copilot CLI** (`--yolo -s`)
- code と review で **異なる CLI ベンダー** を使い分けたい

## 問題: skill が agents.yaml を尊重していない

現状の `/opsx:manage` skill (`.claude/commands/opsx/manage.md`) は、
code / review / verify の各 stage で **Task tool を無指定** (`subagent_type`
指定なし) で呼び出す:

```
Invoke the code worker via Task tool with:
  prompt: |
    /opsx:code <change-id>
    <priorFindings>

Invoke the review worker via Task tool with:
  prompt: /opsx:review <change-id>
```

これは Claude Code の Task subagent (=同じ Claude session) を spawn する
ので、実際には **copilot は一切起動されず**、claude が `/opsx:review`
skill を解釈して review.md を書く。agents.yaml の
`copilot-review.command: copilot` は無視される。

## 解きたい問い (これを Copilot に聞きたい)

Manager loop skill が agents.yaml の role→CLI マッピングを尊重するように
書き換えたい。特に **copilot 側**の仕様を確認したい:

### Q1. copilot CLI の non-interactive 呼び出し

`copilot --yolo -s` の `-s` は "shell mode" (session? script? stream?)
どういう意味か。stdin を prompt として受け付けるのか、`--prompt` 相当の
オプションがあるのか。

期待する呼び出し例 (skill が Bash 経由でやる想定):

```bash
copilot --yolo -s <<'EOF'
/opsx:review add-dummy-tab
EOF
```

or

```bash
copilot --yolo -s "/opsx:review add-dummy-tab"
```

どちらが正しい?

### Q2. copilot 側の slash command / skill 定義

`/opsx:review <id>` は現状 Claude Code の
`.claude/commands/opsx/review.md` に定義された prompt template。
copilot 側で同等の slash command を認識させる方法はあるか?

- copilot にも `.copilot/commands/` みたいな per-project skill 機構がある?
- なければ skill の中身 (review.md の全文) を prompt として直接
  渡す形になる。その場合、
  `openspec/changes/<id>/review.md` を書く指示を prompt にどう
  埋め込むと安定するか (copilot の system prompt との衝突は?)

### Q3. review.md 出力の観察

Manager は review worker 完了後 `openspec/changes/<id>/review.md` を
`cat` して frontmatter の `verdict:` を読む (`pass` / `needs-rework`)。
copilot subprocess が worktree 内で file を書けるなら OK
(`.worktrees/<id>/openspec/changes/<id>/review.md`)。
copilot は `--yolo` で file write の permission prompt を skip する認識
だが正しいか。

### Q4. exit code / エラー検出

Manager は worker 失敗を検知して escalate する必要がある。
copilot subprocess の exit code は「prompt 完遂の可否」を意味するのか、
それとも「CLI 自体の errored かどうか」だけか。

前者ならそのまま bash `$?` で分岐。後者なら review.md の有無で判定するしかない。

### Q5. 代替パターン

copilot に skill 相当を持たせずに、Claude Code 側から MCP / hook で
copilot を呼ぶ形もありうる (例: `.mcp.json` に copilot MCP server 登録)。
copilot 陣営としてどのパターンが推奨か。

## 想定する `manage.md` 改修 (Q が解ければ)

擬似コード:

```
for each worker stage (code, review, verify):
  role = stage.role
  entry = agents.yaml で roles に role を含む entry
  prompt = entry.prompts[role] || 既定テンプレート

  if entry.command == "claude":
    # Claude subagent 経由
    Task(prompt=prompt, subagent_type=<entry.name?>)
  else:
    # 外部 CLI 経由
    cd .worktrees/<id> && <entry.command> <entry.args...> "<prompt>"

  # 完了後: review stage なら review.md を読む → verdict 分岐
```

`entry.command == "claude"` の分岐は既存踏襲。それ以外 (copilot 含む)
は Bash 経由の subprocess として一律に扱えると想像している。

## Non-goals (この relay で答えて欲しくないもの)

- **agents.yaml schema 変更提案** → 別 propose。schema は今のまま(mode /
  roles / command / args / prompts) を前提に skill 側で吸収したい。
- **Multi-CLI 間の messaging** → 対象外 (parked idea:
  `docs/ideas/2026-07-06-cross-agent-messaging.md`)。
- **Claude vs Copilot の一般的な比較** → 対象外。今は role→CLI の
  mechanic だけ知りたい。

## 依頼 (copilot への相談内容 まとめ)

Q1〜Q5 に対する copilot 側の推奨実装を教えてほしい。特に:

- `copilot --yolo -s` の prompt 引き渡し方 (stdin / positional / --flag)
- copilot 側の per-project slash command 定義の有無
- `openspec/changes/<id>/review.md` を書く prompt を直接渡す構成の
  安定性 (frontmatter 出力の再現性)

回答が来たらこの idea を promote し、正式な propose
(`wire-role-to-cli-in-manager-skill` 想定) にする。

---

## Copilot 回答 (2026-07-16)

### 結論

Manager から Copilot を呼ぶなら:

```bash
copilot -C ".worktrees/$id" \
  --agent review-worker \
  --yolo \
  -s \
  -p "$prompt"
```

を subprocess で叩く形が本命。

- `-p/--prompt` = 正規の prompt 受け口 (non-interactive)
- `-s/--silent` = 出力簡略化。**shell / session / stream ではない**
- `-C <dir>` = 作業ディレクトリ指定
- `--yolo` = permission prompt を skip (file write を含む)
- `--agent <name>` = review 用 custom agent を指定して安定契約にする

### Q1: prompt 引き渡し

- 正解: `-p "$prompt"`
- ✗ `copilot --yolo -s <<EOF ...` は不採用 (stdin は正規経路ではない)
- ✗ positional prompt も避ける
- `copilot --help` に `-p, --prompt` が non-interactive 用として documented

### Q2: Copilot 側の slash command 機構

- **無い**。Claude の `.claude/commands/*.md` に相当する documented な custom slash
  command 拡張点は copilot CLI にない。
- copilot CLI の documented な拡張点は:
  - **skills**: `.github/skills/`, `.agents/skills/`, `.claude/skills/`
  - **custom instructions**: `.github/copilot-instructions.md`, `AGENTS.md`, `CLAUDE.md`
  - **custom agents**: `--agent <name>`
- ⚠️ **skills は "入口" ではなく "中身"**。以下の対比が重要:

  | 仕組み | 何をするか | 用途との適合 |
  | --- | --- | --- |
  | custom slash command (Claude 側) | `/name ...` を CLI が構文として受けて特定処理に振る | 求めているものそのもの |
  | skill (`.github/skills/` 等) | モデルに追加の手順・専門知識を与える | `/opsx:review` という**入口の保証にはならない** |

- 実測: `copilot -p "/opsx:review add-dummy-tab"` で review.md 生成は動くが、
  これは documented な custom slash command として保証されたわけではない
  → **安定契約にはしない**。
- 推奨: `--agent review-worker` + repo instructions で「入口」を安定化。
  prompt には slash command 名ではなく具体タスク (review 指示 + 出力契約) を渡す。

### Q3: file write の permission

- `--yolo` で file write は OK。help 上も all permissions 相当。
- `.worktrees/<id>/openspec/changes/<id>/review.md` を直接書かせる構成で問題なし。
- Manager は **stdout ではなく review.md を唯一の成果物契約**として読むのがよい。

### Q4: exit code の意味論

- exit code は「タスク成功」ではなく「**CLI 呼び出しとして成立したか**」に近い。
- 実測: copilot に `false` を実行させて「失敗した」と返させたケースでも
  プロセス終了コードは **0**。
- 成否判定は 3 段階に分ける:
  1. copilot 非0終了 → **subprocess failure**
  2. 0 終了だが review.md なし / frontmatter 不正 → **contract failure**
  3. review.md あり → `verdict:` を読んで pass / needs-rework 分岐

### Q5: MCP / hook か direct subprocess か

- **direct subprocess 推奨**。MCP/hook を経由する必要はない。
- `agents.yaml` が既に `command + args + prompts` を持っているので、
  Manager 側の分岐は:
  - `command == "claude"` → 既存どおり Claude 側の Task tool
  - それ以外 → `<command> -p "$prompt"` を subprocess

### 実装指針 (Manager loop skill 側)

1. prompt 受け渡しは `-p` 固定
2. 実行位置は `copilot -C ".worktrees/$id"`
3. review 成否は exit code ではなく review.md
4. Copilot 固有ロジックは **custom agent (`.github/agents/review-worker.md` 相当)
   + repo instructions (`AGENTS.md` / `CLAUDE.md`)** に寄せる (slash command 互換
   は狙わない)

---

---

## User による設計調整 (2026-07-16, 追加情報)

Copilot の回答を踏まえた上で、以下を確定:

### `--agent <name>` は skill から指定しない

Copilot の `--agent review-worker` は user が明示的に登録して呼び出す
拡張点だが、**本 skill の設計では要求しない**。理由:

- user が custom agent 定義を用意しないと動かない、では adoption barrier が高すぎる
- Instructions ファイル (repo-level) で code / review の contract を
  伝える方が全 CLI 横断で portable

### Instructions ファイル戦略

Copilot / Antigravity の code role, review role には **repo-level
instructions を配置**して振る舞いを固定する:

- `.github/copilot-instructions.md` (Copilot が自動読込)
- `AGENTS.md` (Antigravity / 一般 agent CLI 想定の共通契約)
- `CLAUDE.md` (既存; Claude 用)

内容の例 (review 用):

```md
When you are asked to review an OpenSpec change:

1. Read openspec/changes/<change-id>/{proposal,tasks,specs}.md.
2. Inspect the impl commits on the current worktree branch.
3. Write openspec/changes/<change-id>/review.md with frontmatter:
   ---
   verdict: pass | needs-rework
   findings:
     - severity: high | medium | low
       file: ...
       line: ...
       message: ...
   ---
4. Do NOT commit. Manager reads review.md via file, not stdout.
```

これで CLI 種別によらず review 出力契約が固定される。slash command
名 (`/opsx:review`) を CLI 側で解釈させる必要がなくなる。

---

## Antigravity (`agy`) — 三つ目の CLI として同型で扱える

Antigravity 側の回答 (要点):

- `-p / --prompt / --print` で非対話プロンプト受け付け (Copilot と同じ形式)
- `--dangerously-skip-permissions` で file write の permission skip
- `--agent <name>` は optional (本設計では使わない)
- Exit code semantics も Copilot と同じ (subprocess-level は非0 で拾える、
  semantic 失敗は 0 で返る) → **review.md 契約による 3 段階判定**が
  そのまま使える
- Direct subprocess 呼び出し推奨

呼び出し例:

```bash
cd .worktrees/$id && agy \
  --dangerously-skip-permissions \
  --model gemini-3.5-flash \
  -p "$prompt"
```

agents.yaml 例:

```yaml
- name: antigravity-review
  mode: single-prompt
  roles: [review]
  command: agy
  args: [--dangerously-skip-permissions, --model, gemini-3.5-flash]
  prompts:
    review: /opsx:review ${change_id}
```

Copilot と Antigravity は「subprocess + `-p` + permission-skip flag +
instructions ファイル」というほぼ同一のパターンに畳めるので、
Manager skill 側は **command 名で分岐するのではなく、
「claude ならば Task tool / それ以外は subprocess」** という単純 2 分岐で足りる。

---

## 確定した Manager loop skill の分岐

```
for each worker stage (code, review, verify):
  entry = agents.yaml で roles に stage.role を含む entry
  prompt = entry.prompts[stage.role] || 既定テンプレート
  cwd = ".worktrees/<change-id>"

  if entry.command == "claude":
    # Claude subagent 経由
    Task tool: prompt=prompt (cwd は subagent に指示)
  else:
    # 外部 CLI 経由 (copilot / agy / 他)
    cd $cwd && <entry.command> <entry.args...> -p "$prompt"

  # 成否判定 (review / verify stage の場合):
  #   subprocess 非0 exit         → subprocess failure → escalate
  #   0 exit だが review.md 無し   → contract failure   → escalate
  #   review.md あり              → verdict を読んで pass / needs-rework 分岐
```

**注: `-p` は Copilot も Antigravity も共通**。プロンプト受け口が
統一されているので skill 側の分岐は最小。

---

## Next actions

1. この idea を promote → propose `wire-role-to-cli-in-manager-skill` に落とす。
2. propose のスコープ:
   - `.claude/commands/opsx/manage.md` の Task tool 呼び出しを
     agents.yaml 読み込み + 「claude → Task tool / それ以外 →
     subprocess `-p`」の 2 分岐へ書き換え
   - Instructions ファイル (`.github/copilot-instructions.md`,
     `AGENTS.md`) 追加 — code / review の出力契約を明文化
   - 成否判定の 3 段階契約 (subprocess exit / review.md 存在 /
     verdict) を skill 本文に明文化
   - agents.yaml `command` の存在チェック / 未定義 role の
     graceful degrade を仕様化
3. 検証は `add-dummy-tab` を target に:
   - `/opsx:manage add-dummy-tab` を terminal から起動
   - code (claude) → review (copilot or agy) → verify の chain が
     回ることを観察
   - review.md の verdict が pass になるまでの反復回数を記録

