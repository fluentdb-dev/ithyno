# Outcome — redesign-skill-namespace-and-dispatch

## ✅ Worked

- **`ithy-opsx:` namespace 分離**: `.claude/commands/opsx/` から
  `manage.md` / `code.md` を削除、`review.md` / `verify.md` を
  `ithy-opsx/` に git mv、新規 `ithy-opsx/dispatch.md` 作成。
  namespace の意味論が「opsx: = pure OpenSpec、ithy-opsx: = ithyno
  依存」で綺麗に整列した。
- **Dispatch helper protocol の抽出**: manage.md が code / review /
  verify 各 stage で書き散らしていた「agent 検索 → prompt 解決 →
  claude/others 分岐」のロジックを Dispatch helper セクションに
  一元化。各 stage は「Dispatch helper を S=code / S=review /
  S=verify で呼ぶ」の 1 行参照になり、可読性 大幅向上。
- **3-stage success 契約**の対象を code stage から明示的に除外。code は
  「artifact 契約なし、subprocess exit だけで OK」と明記して、
  review / verify との対称性を捨てた代わりに正確性を得た。
- **AgentConfigModal.tsx の client-side mirror** も同じ default
  prompts に揃えた。将来 agents タブの Add/Edit 画面で `roles:
  [propose]` を選ぶと `/opsx:propose ${change_id}` が placeholder に
  出るはず (未 verify)。
- **Puppeteer 検証で見えた挙動**:
  - Modal タイトル: "Dispatch this change" (was "Apply this change")
  - Prefill: `/ithy-opsx:dispatch add-agent-process-detach`
  - Send button: `Send /ithy-opsx:dispatch`
  - Card Start button の tooltip 全部更新
  - 23 startable cards 全て有効表示 (agents: [] のまま)
- **manager role の live-shell 強制は現状踏襲** — 前議論で「manager
  は常時起動 Claude、Agent 化不要」と結論、config-writer.ts の制約は
  そのまま。

## ⚠️ Surprises

- **`git mv` は無問題だった** — review.md / verify.md を `opsx/` から
  `ithy-opsx/` に move したが、Claude Code の slash command 認識は
  file location driven のようで、`/ithy-opsx:review` として即座に
  reload される (system-reminder で確認できた)。
- **既存 `ithy-opsx/apply.md` と `ithy-opsx/merge.md` が既にあった** —
  `ithy-opsx/` は空じゃなかった。`ithy-opsx-apply` / `ithy-opsx-merge`
  skill と対をなす commands だった。redesign の意味論とも合致してる
  ので trust しつつ、dispatch.md がこれらに依存しない設計になっている
  ことを確認した。
- **`kind: "apply"` in Kanban.tsx が dead code だった** — PendingDrag
  variant として declared されているが setter が無い。今回 redesign
  で `/opsx:apply` → `/ithy-opsx:dispatch` に inject 内容を変えたので、
  もしこの dead code の apply variant が復活するときは `dispatch`
  に相当する新 kind を追加すべき。今は放置。
- **manager singleton constraint** が config-writer.ts に残っていて、
  今の設計に照らすと「roles に manager が含まれる agent は 1 つまで、
  かつ mode: live-shell 必須」の 2 制約が正しい。`propose` / `verify`
  role には制約なし。この asymmetry は "manager だけが持続 session"
  という intent の反映で、意図通り。
- **registry-reshape.test.ts の 1 test 破損** — verify role の
  built-in default を `/ithy-opsx:verify` に変えたら、test の期待値
  (`/opsx:verify`) が古かったので即座に fail。test を更新して pass。
- **Puppeteer verify で WS が offline のまま** — 前回同様、Vite proxy
  の /ws 転送が失敗するが、Kanban render 自体は API 経由で成立する。
  今回も同じ pattern で無事完走。

## 🔁 Differently

- **manage.md → dispatch.md の書き直しで既存の "step 3 worktree" の
  重複を残した** — apply.md にも worktree bootstrap を入れる Phase 2
  case は revert 済みで、今は dispatch.md が唯一の worktree 責務者。
  ただ Manager loop 時代の "step 3 Ensure worktree" と、Phase 2 で
  一時的に apply.md 側にも入れた bootstrap の 2 か所が history 上
  残る。将来 spec の Manager Loop → Dispatch RENAMED が archive
  で fold されると overwrite で綺麗になる。
- **`propose` role の built-in default に `${change_id}` template を
  入れた** が、propose は「new change を作る」のだから初回時点で
  change_id が存在しない矛盾がある。実際には dispatch が propose
  role を呼ぶ時は description を渡す想定なので、template variable
  は `${change_id}` じゃなく `${description}` の方が正確。今は
  syntactic consistency 優先で `${change_id}` にした。将来
  agmsg-based dispatch を実装するときに調整。
- **Copilot instructions / AGENTS.md は content 重複** で、片方
  更新して片方忘れるリスクは残る。CI check を入れる or
  master doc に一本化して symlink する等の運用は out of scope。

## 🎯 手動 verify 実測 (task 9.4)

user から `/ithy-opsx:dispatch add-dummy-tab` を実行、iteration 2
まで観察して chain 完動を確認:

**Iteration 1:**
- Step 1-4 (context read / phase check `null → coded` / mode resolve
  worktree PARALLEL=true / worktree bootstrap `.worktrees/add-dummy-tab/`
  on `agent/add-dummy-tab`)
- code stage (Task tool, agents.yaml.code = claude): commit `a73655e`
  Playground tab 実装 + task 7 ticked、typecheck/test/build 全 pass
- review stage (subprocess, `copilot --yolo -s -p /opsx:review
  add-dummy-tab`): review.md written (worktree copy)、verdict
  `needs-rework` (test 欠落 finding)
- 3-stage 契約通過 → priorFindings に serialize して loop back

**Iteration 2:**
- code stage (Task tool, priorFindings 付き prompt): commit `64dd56a`
  Playground.test.ts 7 tests 追加、test count 211 → 218
- review stage (subprocess, copilot): verdict `needs-rework` (severity
  `low`, `/docs` route regression coverage 不足)

**観察収束傾向:** finding severity high → medium → low、真面目に収束方向。

**verify 済み機能:**
- ✅ agents.yaml driven CLI dispatch (Task tool / subprocess の 2 分岐)
- ✅ 3-stage success contract (subprocess exit / review.md 存在 / verdict)
- ✅ verdict routing (needs-rework → priorFindings serialize → 次 code 迭代)
- ✅ priorFindings が実際に code prompt に流れて worker が対応する
- ⏸️ verify stage 起動 (pass verdict 未到達で観察打ち切り)
- ⏸️ MAX_ITERATIONS 到達での escalate

## 🌱 想定外の副次発見 (次 propose 対象)

manual verify で明確に見えた **設計 gap**:

1. **Kanban placement が job registry 依存で folder 状態を無視**:
   Task tool subagent で code stage を回した結果、`.worktrees/
   add-dummy-tab/` は作られたし phase も `coded` に上がったが、
   `bucketize` が `job` 存在で判定するので Kanban 上 TODO のまま。
   **runtime-collapse philosophy と反する残骸**、placement を
   folder-driven に切替えるべき。
2. **`parallelExecution: false` の single-concurrency gate 未実装**:
   現状「並列を許すか」の boolean だが、false 時に「1 change だけ
   active」を強制する gate が存在しない。`.worktrees/.lock`
   semaphore file 案で folder-driven に組める。

これらは次 propose (`collapse-jobregistry-and-add-semaphore` 仮) で
bundle。

## 🌱 Follow-ups

- **`collapse-jobregistry-and-add-semaphore` (次 propose):**
  - `bucketize` を folder-driven に (`.worktrees/<id>/` 存在 →
    IN-PROGRESS)
  - `worktreeProgress` の source を tasks.md 直接 read に (job 経由撤去)
  - Diff view / Merge/Discard actions を fs 経由に
  - `.worktrees/.lock` semaphore file
  - `useStartFlow` に lock-based gate
  - Live streaming (現 `runAgent`) を attach-on-demand に降格
- **手動 verify 9.5**: `agents.yaml` に `roles: [propose]` entry を
  書いて Agents タブで edit 可能なこと確認。
- **手動 verify 9.5**: Agents タブの Add モーダルで `roles: propose`
  を選択できるか、`/opsx:propose ${change_id}` が placeholder に
  出るか。UI 反映確認。
- **`agents.yaml.example` 更新** — 現存するなら `roles: [propose]` /
  `roles: [verify]` の例を追記。task 5.5 未処理。
- **agmsg 実装** — live-shell worker (agmsg 経由で task を受ける) の
  ユースケースは docs/ideas に parked のまま。dispatcher 側で
  `mode: "live-shell" + roles: [code|review|verify]` の entry を
  見つけた場合の分岐が dispatch.md では特に書いていない (現状は
  single-prompt の Task tool / subprocess の 2 択のみ)。
- **`kind: "apply"` dead code 掃除** — Kanban.tsx の PendingDrag に
  未使用の variant がある。次のダブル cleanup で落とすか、`dispatch`
  相当の新 variant にするか判断。
- **`ithy-opsx:apply` skill との関係整理** — `.claude/commands/
  ithy-opsx/apply.md` (既存) は "opsx:apply + commit" のラッパー。
  dispatch.md の code stage で `entry.command == "claude"` 経路の
  時にどちらを呼ぶか (今は `/opsx:apply`、が `/ithy-opsx:apply` の
  方が「dispatcher が commit しなくて済む」設計上 clean かも)。
  次の refactor で検討。
