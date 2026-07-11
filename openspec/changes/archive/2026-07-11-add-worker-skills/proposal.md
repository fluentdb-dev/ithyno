---
tags: [phase-4, workers, skills, slash-commands, review, verify, escalate]
phase: 4
milestone: Manager 本体 (前半 — workers)
sequence: 1
depends_on:
  - add-runtime-abstraction
  - add-dispatch-endpoint
  - extend-agent-job-model
  - add-review-artifact
enables:
  - add-manager-loop-skill
---

## Why

Phase 3 で substrate が揃った (`/opsx:dispatch` / `review.md` schema /
`DispatchResult.verdict`)。Phase 4 の Manager は `/opsx:apply` claude
session として動き、Bash + curl で `/opsx:dispatch <role> <change-id>` を
叩いて workers を回す。

Manager 実装の前に、**呼ばれる側 (worker skills) を独立に用意**する。
これで:

- 各 worker が Manager 無しでも `/opsx:dispatch <role>` から手動で叩けて
  test 可能
- Manager の proposal が worker の動作を assume できる (blackbox 契約が
  spec 化されているため)
- Fable review MEDIUM #5 の「Phase 4 を分割」に沿い、Manager と workers を
  独立 change にして bisect 性 up

Worker は 4 種類:

1. **`/opsx:review <id>`** — code の diff を read、review.md 出力
2. **`/opsx:verify <id>`** — test / typecheck / build 実行、結果報告
3. **`/opsx:escalate <id> "<question>"`** — needs-human.md 経路の
   caller-side slash command
4. **`/opsx:answer <id> "<answer>"`** — 同 answer 経路

各 worker は **prompt template** (`.claude/commands/opsx/<name>.md`) と
して定義。実行時は Ithyno が dispatch で claude を spawn し、この
template が initial prompt になる。

## What Changes

### 1. `/opsx:review <change-id>` slash command

`.claude/commands/opsx/review.md` を新規作成。**役割**:

- Change の proposal / tasks / spec / diff を Read
- worktree の変更を評価
- `openspec/changes/<change-id>/review.md` を **schema 準拠**で書く:
  - Frontmatter: `verdict: pass | needs-rework`、findings 配列 (任意)、
    summary 一言 (任意)
  - Body: 補足の narrative
- verdict の判断基準:
  - **pass**: 変更が proposal の "What Changes" に沿い、test は
    別 verify で通る前提でよく、明白な bug / spec 違反 / security 問題が
    無い
  - **needs-rework**: 上記に該当する問題を 1 件でも見つけた場合

### 2. `/opsx:verify <change-id>` slash command

`.claude/commands/opsx/verify.md` を新規作成。**役割**:

- worktree 内で以下を順に実行 (fail-fast):
  1. `npm test` (or project の verify command — Fable MEDIUM #6 で
     Node 決め打ち指摘あり、Phase 4.1 では **Node 前提**で書き、
     Phase 4.2 or 5 で `agents.yaml` に `verify_command` field を
     追加する idea note を残す)
  2. `npm run typecheck`
  3. `npm run build`
- 全部 pass なら **review.md を書く** (verdict: pass、summary:
  "verify pass")
- fail した command があれば **review.md を書く** (verdict:
  needs-rework、summary: "verify failed at <command>"、findings に
  該当行 or error message)
- 出力は review.md (verify の verdict も review artifact schema を
  使う — Manager は同じ parser 経路で処理できる)

### 3. `/opsx:escalate <change-id> "<question>"` slash command

`.claude/commands/opsx/escalate.md` を新規作成。**役割**:

- `POST /api/changes/<change-id>/needs-human` を Bash + curl で叩く
  (Phase 2 で shipped API)
- Body: `{ question: "<引数の question>", context: "<change の現状の
  文脈>" }`
- Response 成功で "escalated to human" を報告
- 副次: この escalate は agent 自身が「詰まった時」に呼ぶ。Manager が
  呼ぶ経路は Phase 4.2 で

### 4. `/opsx:answer <change-id> "<answer>"` slash command

`.claude/commands/opsx/answer.md` を新規作成。**役割**:

- `POST /api/changes/<change-id>/needs-human/answer` を Bash + curl で
  叩く (Phase 2 API)
- Body: `{ answer: "<引数の answer>" }`
- Response 成功で "answer submitted" を報告
- 呼ぶタイミング: user が Claude Code の interactive session で回答を
  書いた後、agent が明示的に close するために叩く

### 5. workers を Ithyno から dispatch で呼ぶ経路

これは **既に Phase 3.2 で完成済**。`/opsx:dispatch review add-foo` を
叩くと Ithyno が role="review" の agent を spawn、その agent の prompt
template が `/opsx:review add-foo` 相当になる (Phase 3.1 runtime
abstraction の prompt field 経由)。

**agents.yaml** に追加する例 (今回 change の repo 内 agents.yaml は変更
しない — Phase 4.2 or 5 の Config UI で書く。今回は spec と slash command
のみ):

```yaml
runtimes:
  claude:
    command: claude
    baseArgs: [--dangerously-skip-permissions]
    promptStyle: cli-arg
    promptFlag: -p
    supports: { interactive: true, artifactOutput: true, diff: git }

agents:
  - name: review-claude
    role: review
    runtime: claude
    prompt: /opsx:review ${change_id}
    specialties: [any]
    dedicated: false

  - name: verify-claude
    role: verify
    runtime: claude
    prompt: /opsx:verify ${change_id}
    specialties: [any]
    dedicated: false
```

## Fable review 対応の反映

- **HIGH #1**: worker skills は **Bash tool 経由**の実装 (curl / npm
  test etc.) を明示。RPC magic ではなく shell 実行と明記
- **MEDIUM #5**: 4.1 (workers) と 4.2 (Manager) に分割
- **MEDIUM #6**: verify が Node 決め打ちなのは今回 scope 内で承認、
  `agents.yaml` に `verify_command` field を追加する idea note を
  Phase 4 完了後に起票 (`docs/ideas/2026-07-08-verify-command-per-project.md`)

## Out of scope

- **Manager 本体** — Phase 4.2 `add-manager-loop-skill`
- **`ithy-opsx-apply` skill の migration** — Phase 4.2 で判断
- **Verify command の per-project 化** — Phase 4 完了後の idea note
- **Escalate 時の automatic Manager pause** — Phase 6 の通知チェーンで
  設計、今回 change では escalate は「API 呼ぶだけ」の caller
- **Answer 送信後の Manager 再起動** — Phase 4.2 で Manager loop の
  再入経路を書く
- **UI (Kanban / Agents タブ)** — 変更なし

## Impact

- 新規 `.claude/commands/opsx/review.md` (~80 LOC)
- 新規 `.claude/commands/opsx/verify.md` (~50 LOC)
- 新規 `.claude/commands/opsx/escalate.md` (~30 LOC)
- 新規 `.claude/commands/opsx/answer.md` (~30 LOC)
- Spec delta: 4 ADDED requirements
- Tests: workers は slash command の template そのものなので unit test
  なし。Phase 4.2 で Manager が動く時に end-to-end で確認
- 既存 code / test に影響なし
- Backward compat: 100% (追加のみ)
