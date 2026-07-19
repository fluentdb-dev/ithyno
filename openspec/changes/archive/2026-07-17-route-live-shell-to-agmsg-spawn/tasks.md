# Tasks — route-live-shell-to-agmsg-spawn

## 1. PENDING annotation (hard rule)

- [x] 1.1 `openspec/specs/dashboard/spec.md` の
  `### Requirement: Dispatch Slash Command` の SHALL 段落直後に
  `> ⚠️ **PENDING MODIFIED** by [route-live-shell-to-agmsg-spawn]
  (../../changes/route-live-shell-to-agmsg-spawn/): agmsg branch
  を dispatch protocol に追加する予定` を挿入

## 2. Skill: dispatch helper protocol の書き換え

- [x] 2.1 `.claude/commands/ithy-opsx/dispatch.md` の "Dispatch
  helper protocol" セクション (現状 2 branches: Task tool / subprocess)
  に **first branch** として "agmsg spawn" を追加。分岐条件:
  `entry.mode == "live-shell"` AND `agents.yaml` に `agmsg` block
  が存在
- [x] 2.2 agmsg-type 導出テーブル (`claude→claude-code`, `codex→codex`,
  `copilot→copilot`, `gemini→gemini`, `antigravity→antigravity`,
  `opencode→opencode`, `cursor→cursor`) を skill 本文に明記
- [x] 2.3 unknown command escalation 文言: `agmsg-type unknown for
  command: <cmd>` を statement とスクリプト内 sed 例で示す
- [x] 2.4 agmsg 未 install の fallthrough 条件: `~/.agents/skills/
  agmsg/scripts/send.sh` の存在チェック → 未存在 → subprocess/
  Task tool branch に fall through、stdout に notice

## 3. Skill: 3-stage success contract の agmsg 版

- [x] 3.1 code stage polling: `git log agent/<change-id> -1
  --format=%H` を 5s interval / 15min ceiling で監視、変化検知で
  step 5 へ抜ける
- [x] 3.2 review/verify stage polling: `openspec/changes/<id>/
  review.md` 存在 + frontmatter parse を 5s interval / 5min ceiling
- [x] 3.3 タイムアウト escalation 文言: `code stage agmsg worker did
  not commit within timeout` / `<stage> agmsg worker did not produce
  review.md within timeout`

## 4. Skill: Manager は agmsg branch を通らない条件を明記

- [x] 4.1 `roles` に `manager` を含む entry は step 3 の worker
  dispatch には来ない (Manager 自身が dispatcher なので) が、防御的に
  branch の説明に "Manager is never dispatched here" を明記

## 5. Verify

- [x] 5.1 `openspec validate route-live-shell-to-agmsg-spawn --strict`
  VALID
- [x] 5.2 `npm test && npm run typecheck && npm run build` clean
  (skill-only change なので code 変更なし; regression 確認のみ)
- [ ] 5.3 手動: `agents.yaml` に `agmsg: { team: verify }` を追加、
  `mode: live-shell` + `command: copilot` の review worker entry を
  1 件追加、agmsg を実際に `/plugin marketplace add fujibee/agmsg`
  でインストールした Claude session で `/ithy-opsx:dispatch` を打つ
  → review stage で `/agmsg spawn copilot <name> --boot-prompt ...`
  が実行される (tmux pane が split する) ことを確認。**deferred**:
  agmsg を install するには user 側の Claude session に marketplace
  経由でプラグインを追加する必要があり、この harness からは行えない
- [ ] 5.4 手動 fallthrough 確認 — 上記と同様 user 側で agmsg 未
  install の状態を作って dispatch → notice 表示 → subprocess
  branch。**deferred** (5.3 と同じ理由)
- [ ] 5.5 手動 unknown-command escalation — agmsg install 済み +
  `mode: live-shell` + `command: my-wrapper` (mapping にない) で
  dispatch。**deferred** (5.3 と同じ理由)

## 6. Post-impl

- [x] 6.1 outcome.md
- [ ] 6.2 `/ithy-opsx:archive route-live-shell-to-agmsg-spawn`
