# Outcome — wire-role-to-cli-in-manager-skill (Phase 1)

## ✅ Worked

- **useStartFlow の縮小が想像以上に効いた**。150 行の hook 本体が
  約 85 行に。分岐を全部消したので readability も大幅改善。
  「常に terminal に inject するだけ」と一言で説明できる状態。
- **削った UI 資産の量**: AgentPickerModal.tsx / UncommittedProposalModal.tsx
  / selectStartAgent.ts + test / `.agent-picker` CSS block /
  `.uncommitted-proposal-modal` CSS block。全部 orphan にならず綺麗に
  切れた (grep で残存参照ゼロ確認)。
- **type check / test / build** が一発で通った。selectStartAgent の
  test 7 本が減った以外は 211 pass / 1 skip。CSS 1.1 kB / JS 6 kB 減。
- **Phase 2 の spec を同一 propose に載せた設計** が正解だった。
  spec-vs-reality gap (`/opsx:dispatch` refs) を残さずに、UI walk-back
  と skill 設計を同じアーカイブに畳めた。将来の Phase 2 propose では
  ADDED / MODIFIED を書き足す必要なく impl と outcome だけで足りる。
- **`parallelExecution` 設定を UI から切り離しても config storage は
  そのまま残っている** — Settings toggle は動くまま、agents.yaml も
  互換保持。ユーザーが「skill が config を読む」実装を追加する Phase 2
  はほぼ additive でいけそう。

## ⚠️ Surprises

- **削除された `startWorktreeFlow` の中に隠れていた諸々**:
  - `fetchChangeGitState` API 呼び出し (uncommitted proposal 検知)
  - `runAgent` API 呼び出し (`POST /api/agents/run`)
  - `commitChangeProposal` (「proposal 未 commit なら commit + retry」)
  これらの sever-side endpoint は Phase 2 skill が使う可能性があるので
  残置。もし Phase 2 で skill が bash から直接 git 叩く形になったら
  server-side を revert する propose を立てる。
- **`ParallelStartLauncher.tsx` の候補フィルタ** は思ったより小さかった。
  `startableCandidates(changes, jobByChange, agents)` の中身が worktree
  ロジックに触っていないので、hook 側の変更だけで済んだ。
- **PENDING annotation 位置の再現性**: 以前 add-parallel-execution-config
  の際に learned した「blockquote は SHALL paragraph の後」ルールが
  Phase 2 の複数 requirement でも同じ落とし穴として出た。学び直し
  すぎているので、今後は最初から後ろ置きで書く。
- **spec delta で `> **Phase 2 requirement**` blockquote を "informational
  note" として活用**したのは新しいパターン。validator は blockquote
  中の SHALL/MUST を拾わないので、位置さえ間違えなければ note の
  格納に使える。

## 🔁 Differently

- **Impl phase の split を tasks.md セクションで表現した** — 「Phase 1
  (impl now) / Phase 2 (defer)」を明示。archive 時に unchecked が
  残るのは意図的なので `--yes` で通す。次回同じパターンをやるときは
  proposal.md の書式 (Phase 1 / Phase 2 見出し + それぞれの spec deltas
  リスト) をテンプレ化した方が読み手に優しい。
- **手動 verify (3.5〜3.7) を残したまま archive してよいか** の判断が
  add-parallel-execution-config の時と同じ形。今回も outcome の
  🌱 Follow-ups に "browser check pending" を書いておく方針。
- `Settings` toggle は Phase 1 では effectively no-op になった (UI が
  読まなくなったので)。ユーザから見ると「toggle 動くが挙動が変わらない」
  状態 = 混乱の元。Phase 2 が landing するまで tooltip か
  banner で "Skill 実装待ち" と示す方が親切だったかも。今回は out of
  scope としたが、Phase 2 propose に含める。

## 🌱 Follow-ups

- **手動 verify** (3.5〜3.7): dev server 起動して Kanban Start が
  CommandModal のみ出ることを目視確認。parallelExecution=true 時も
  同じ挙動になることを確認。
- **Phase 2 propose 作成**: id は `impl-skill-driven-worktree-and-cli`
  (仮)。Scope は Phase 2 tasks.md に既に列挙済み:
  - `manage.md` rewrite (role→CLI dispatch + 3-stage 判定)
  - `apply.md` extend (parallelExecution を読んで worktree spawn)
  - `AGENTS.md` + `.github/copilot-instructions.md` 追加
- **Settings tab の "Skill 実装待ち" 表示**: Phase 2 で `parallelExecution`
  が有効化されるまでの間、Settings tab で toggle を disable にするか
  "Effective only when the skill layer catches up" のような note を
  出すか検討 (Phase 2 に含める)。
- **Server-side worktree API (`POST /api/agents/run` 等) の去就**:
  Phase 2 の skill 実装で使う / 使わないが確定したら、使わないなら
  revert 検討。今は残す判断。
- **agents.yaml の verify-time 手動編集 (`parallelExecution: true`)**:
  archive 時に uncommitted のまま残るのは既存パターン踏襲。ユーザが
  手動 verify 後に元に戻すか、そのまま残すかは自由。
