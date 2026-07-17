# Outcome — revert-add-dummy-tab

## ✅ Worked

- **add-dummy-tab archive without spec fold**: strip `specs/` から
  `openspec archive add-dummy-tab --yes` の順で、`Playground Tab`
  ADDED requirement が現行 `openspec/specs/dashboard/spec.md` に
  fold されないまま archive 完了。0-delta warning は expected。
- **Worktree cleanup**: `git worktree remove --force
  .worktrees/add-dummy-tab` + `git branch -D agent/add-dummy-tab`
  で impl の痕跡 (commits `a73655e`, `64dd56a`) を主流から除去。
  git reflog には残るが、branch tip が消えたので `git show` は
  hash 手打ちで可能な状態。
- **Reverted-target outcome.md**: `openspec/changes/archive/
  2026-07-17-add-dummy-tab/outcome.md` に「throwaway verification
  だった」旨と consumed した 2 archive への link を記録。将来の
  reader が「なぜ Playground が spec に無いのに proposal がある」
  と混乱するのを防ぐ。
- **Throwaway Verification Change Pattern requirement** を追加。
  今後同種の throwaway (multi-agent 検証、new fs 契約検証 etc.)
  を切るとき、この convention に従えばよい形。

## ⚠️ Surprises

- **`--force` が必要だった** — worktree に `openspec/changes/
  add-dummy-tab/review.md` の変更 (copilot review output) が残って
  いて refuse。revert の意図は全消しなので `--force` で妥当だが、
  dispatch skill の spec (「即時 release」の Merge/Discard 経路)
  で自動化された流れなら uncommitted チェックが問題化する可能性。
  Follow-up (collapse-jobregistry-followups) で「Merge/Discard 時に
  worktree 内の未 commit 変更をどう扱うか」を明示する必要。
- **`0-delta` warning は意図通り**だが、`openspec archive --yes` の
  warning は "spec fold されない" の signal として今後も activate
  される。Case β revert で Case-A-とは違うことを認識するための
  健全な noise。
- **`agents.yaml` は `parallelExecution: false` のまま**。この revert
  自体は lock 挙動に依存しないので影響なし。ambient として残置、
  user 判断で戻す。

## 🔁 Differently

- **outcome.md の書式**: `⚠️ REVERTED by [...]` blockquote を先頭
  に置いたが、この blockquote 位置 rule はまだ改善余地あり (以前
  spec 側で learned した「SHALL の後ろ」rule と類似の位置調整が
  必要かも)。今回は archive されるだけなので影響小。
- **Throwaway pattern requirement** を documentation-only な形で
  書いた。実装可能な contract ではなく "future proposer への
  guideline"。spec に置く価値は微妙 — 別途 CLAUDE.md や skill
  docs に寄せるべきだったかも。追い方の指針として残す。

## 🌱 Follow-ups

- **手動 verify (Puppeteer)**: 現状の Kanban で `add-dummy-tab` が
  archive column (DONE)、または一覧から消えた状態を確認 —
  bucketize は archive を DONE 扱いなので前者。
- **`agents.yaml.example` に throwaway pattern の例を追加**?
  proposal.md の "revert 前提" frontmatter tag 例など。out of scope。
- **`.worktrees/` の cleanup 自動化検討** — `git worktree prune` +
  agent branch の孤児対策を dispatcher 側で自動化する propose を
  切る余地。今は手動で問題ないが、頻繁になれば必要。
