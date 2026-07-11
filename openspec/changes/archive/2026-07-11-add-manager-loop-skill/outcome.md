# Outcome — add-manager-loop-skill

## ✅ Worked

- **Manager 全体を 1 prompt template に押し込めた**。`/opsx:manage` は
  ~180 LOC の markdown で loop、safeguard、convergence guard、
  restart recovery、cancellation、escalation の全部を書けた。Phase 3
  substrate が verdict を structured で返してくれるおかげで、Manager 側
  の judgment logic は "pass?" "needs-rework?" "undefined?" の 3 分岐
  だけで済んだ。
- **Restart recovery を prompt レベルで実装**。ステップ 2 の phase check
  が「done/needs-human なら exit、coded なら review 直行、reviewed なら
  verify 直行」を natural に処理する。専用 endpoint / persistence が
  不要。Fable review "missing #restart-recovery" にこの形で対応。
- **Convergence guard を hard-coded で開始**。`MAX_ITERATIONS = 5` は
  hard-code、agents.yaml で override 可能にする案は idea note
  (`manager-max-iterations-config`) で残した。first landing の判断は
  「まず動く実装、後で config」が定石。
- **`/opsx:code` の "escalate instead of committing partial work"
  guardrail** を明示。schema violation / missing dep / unsatisfiable /
  prior verify-failure / dirty worktree の 5 pattern を並べて、code
  worker が silence で commit しない契約を強調した。「Manager loop の
  convergence cap にヒットする最大の理由は findings を無視した code
  worker の commit」という observation を prompt 内で言語化。
- **既存 `ithy-opsx-apply` skill との共存策**を明記。legacy default agent
  は `ithy-opsx-apply` を引き続き使う、Manager 有効化は
  `add-agents-yaml-migration` で行う。この change 単独では
  agents.yaml を触らないので既存 flow が壊れない。
- **Docs 3 本 landed**。usage & migration recipe (concrete yaml example)、
  max-iterations idea、verify-command idea。usage doc は
  「Manager をすぐ試したい人」「agents.yaml 触りたい人」「触りたくない
  人」の 3 パターンを対比、選び方を明示。

## ⚠️ Surprises

- **`/opsx:code` の位置付けが微妙**。既存 `ithy-opsx-apply` skill と
  実質同じ job を持つが invocation 経路が違う (dispatch 経由 vs
  Kanban [Apply] 直呼び)。Doc で「両方共存」と結論したが、将来
  `agents.yaml` migration で default agent を Manager に切り替えた時、
  `ithy-opsx-apply` が deprecated 相当になる。deprecation announcement
  のタイミングを別 change で判断する必要あり。
- **Kanban [Apply] の呼び出し先** を今回 change で変えなかった。理由は
  「agents.yaml migration とセットで判断」だが、user は "Kanban から
  Manager を試せない" の状態が続く。手動 `/opsx:manage <id>` PTY 経路が
  あるので blocked ではないが、Phase 5 UI で Manager を実運用テスト
  する前に migration change を先に landing した方が clean。
- **Verify の Node 決め打ちを idea note に流した** が、Phase 4.1 で
  すでに flagged していた。重複するので verify-command-per-project idea
  note の内容を Phase 4.1 outcome の follow-up と揃えた。1 idea = 1 file
  ポリシーで扱う。

## 🔁 Differently

- **Manager と workers を最初から分けた**のは正解。もし 1 slash command
  内で全部書いていたら 500 LOC を超え、review しづらくなっていた。
  Phase 4.1 (workers) + 4.2 (Manager) の分割は Fable review MEDIUM #5
  の指摘が完全に正しかった。
- **`agents.yaml` migration を同 change に含めなかった**のは判断ミス
  かもしれない。将来 `add-agents-yaml-migration` を書く時に「Manager
  が動く状態」と「agents.yaml が正しい」が 1 change でまとまっていれば
  bisect story が clean。ただし現在の設計だと agents.yaml 変更で Kanban
  [Apply] の挙動が変わる副作用があり、UI regression の risk がある。
  慎重に分けた判断は結果的に安全側。

## 🌱 Follow-ups

- **`add-agents-yaml-migration`** (最重要) — `agents.yaml` を
  runtime-backed shape に書き換え、default agent の initialInput を
  `/opsx:manage` へ、review-claude / verify-claude / code-claude を declare。
  この change 完了で Kanban [Apply] が Manager 起動になる。
- **`add-manager-max-iterations-config`** (idea note で持ち越し) —
  MAX_ITERATIONS を agents.yaml で override 可能に
- **`add-verify-command-per-project`** (idea note) — verify の Node
  決め打ちを解消、Python / Rust / Go project でも動くように
- **`ithy-opsx-apply` deprecation** — migration 後の deprecate 判断
- **Phase 3+4 → main の大 merge** — 46 commits を batch merge、bisect
  story を明示的に判断する change (or session)。Phase 5.1 の前に
  やった方が観測 UI 開発の baseline が clean

## Notes

- 新規 file 5 個:
  - `.claude/commands/opsx/manage.md` (~250 LOC)
  - `.claude/commands/opsx/code.md` (~180 LOC)
  - `docs/2026-07-11-manager-usage-and-agents-migration.md` (~180 LOC)
  - `docs/ideas/2026-07-11-manager-max-iterations-config.md` (~60 LOC)
  - `docs/ideas/2026-07-11-verify-command-per-project.md` (~90 LOC)
- 修正 file なし
- code 変更なし、tests 234 維持
- Backward compat: 100% (agents.yaml 変更なし、既存 skill/agent 全て
  そのまま)
- Fable review alignment:
  - HIGH #1 (Manager as Bash+curl): body で明示
  - Missing #convergence-guard: hard-coded MAX_ITERATIONS + idea note
  - Missing #restart-recovery: phase check で自動対応
  - Missing #cost-tracking: Phase 5+ に持ち越し
