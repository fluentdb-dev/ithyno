# Tasks — signal-stage-completion-via-agmsg-message

## 1. PENDING annotation

- [x] 1.1 `openspec/specs/dashboard/spec.md` の
  `### Requirement: Dispatch Slash Command` の SHALL 段落直後に
  `> ⚠️ **PENDING MODIFIED** by [signal-stage-completion-via-agmsg-message]
  (../../changes/signal-stage-completion-via-agmsg-message/): agmsg
  branch の success contract を polling から message-based wait に
  切り替え、boot-prompt に report contract を追加する予定` を挿入

## 2. Skill: boot-prompt に report contract 追加

- [x] 2.1 `.claude/commands/ithy-opsx/dispatch.md` の agmsg branch
  の `/agmsg spawn ... --boot-prompt "<resolved-prompt>"` 直前で、
  resolved-prompt に report contract を append する
- [x] 2.2 report contract 内の `<team>` は `agents.yaml.agmsg.team`
  から抽出 (sed で `sed -n 's/^  team:[[:space:]]*//p' agents.yaml`)
- [x] 2.3 `<entry.name>` と `<S>` は既存の shell 変数で置換

## 3. Skill: polling を message wait に差し替え

- [x] 3.1 `.claude/commands/ithy-opsx/dispatch.md` の 3-stage
  success contract の agmsg branch セクションを rewrite
- [x] 3.2 wait 手段: `check-inbox.sh` を 5s 間隔で回す loop
  (`~/.agents/skills/agmsg/scripts/check-inbox.sh openspec-ui manager`
  の出力から `from:<entry.name>` の行を grep)
- [x] 3.3 ceiling は既存通り (CEILING_CODE=900, CEILING_REVIEW=300)
- [x] 3.4 timeout → escalate `<stage> agmsg worker did not report within timeout`
- [x] 3.5 duplicate 排除: 一度 process したら次回 loop で無視
  (Manager 側で "processed" flag を local に持つ、または inbox
  clear で mark-as-read)

## 4. Skill: 受信後の artifact judgment

- [x] 4.1 code stage: `git rev-parse agent/<change-id>` を比較。
  変化あり → advance to `coded`。変化なし & tree dirty →
  Manager が `git add . && git commit` を fallback で実行 → advance。
  変化なし & tree clean → escalate `code stage reported done but
  produced no changes`
- [x] 4.2 review/verify stage: `review.md` 読み → 存在しない場合
  1s sleep + 再読み → まだ無ければ escalate `<stage> reported done
  but produced no review.md`
- [x] 4.3 verdict frontmatter parse は既存の grep -oE '^verdict: \w+' 方式

## 5. Verify

- [x] 5.1 `openspec validate signal-stage-completion-via-agmsg-message --strict` VALID
- [x] 5.2 `npm test && npm run typecheck && npm run build` clean
  (skill-only 変更なので regression 確認のみ)
- [x] 5.3 shell test: `check-inbox.sh openspec-ui manager` の
  出力 format を確認し、grep pattern が合致することを bash 単体で verify
- [ ] 5.4 (deferred) 手動 e2e: `/ithy-opsx:dispatch` を実行して
  code stage の spawn → worker が boot-prompt の report 指示通り
  send する → Manager が Monitor で受信 → phase advance を確認

## 6. Post-impl

- [x] 6.1 outcome.md
- [ ] 6.2 `/ithy-opsx:archive signal-stage-completion-via-agmsg-message`
