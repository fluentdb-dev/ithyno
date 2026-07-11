# Outcome — add-worker-skills

## ✅ Worked

- **4 slash command が各 100 LOC 前後の prompt template だけで完結**。code
  変更ゼロ、既存 test に影響なし、typecheck / build も unchanged。
  Substrate (Phase 3.5) がすでに review.md schema + parser + Job.verdict
  + DispatchResult.verdict を担保しているので、worker 側は「schema 準拠で
  markdown を書く」指示だけで済んだ。
- **Fail-fast chain の semantics を verify.md で明示化**。npm test → typecheck
  → build の順で前段が fail したら skip する。partial failure を隠さない
  guardrail も明記。Manager が「verify pass → done、needs-rework → 戻す」の
  判断を勝手にやってくれる。
- **`/opsx:escalate` と `/opsx:answer`** は Phase 2 で shipped の API
  (`POST /api/changes/:id/needs-human` and `/answer`) を Bash + curl で
  叩くだけ。既存 API の response codes (400 / 404 / 409) を worker が
  interpret するので Manager 側の logic は薄くて済む。
- **naming 一貫性** — `.claude/commands/opsx/*.md` は既存の apply /
  archive / dispatch / explore / propose / sync と同じ場所。`opsx:` prefix
  も既存パターン。今回の追加で opsx family が 10 commands に。

## ⚠️ Surprises

- **`/opsx:answer` の 409 handling**。「409 = editor で hand-edit された」
  ケースは "success" 扱いにした (spec の scenario 通り)。Retry しないで
  そのまま Manager に返す設計。もし将来「absolute HTTP 200 のみ success」
  な semantics に変えたくなったら worker と Manager 両方の書き換えが要る。
- **Verify の `stage: test | typecheck | build`** を review.md の summary
  に載せる形にしたが、schema 上は summary は自由文字列。将来 `stage` を
  structured にしたい (`verdict.metadata.stage = "test"`) なら
  add-review-artifact の schema 拡張が要る。今のところ summary の
  "verify failed at test" で足りる。
- **`/opsx:review` の "do not run tests" guardrail**。当初は "run tests to
  make sure they pass" を含めるか迷ったが、それは verify の責務なので
  reviewer には明示的に禁止した。dispatch が並列で verify を呼べば済む。

## 🔁 Differently

- **verify を worker として独立させたのは正解だった** と思う。もし
  Manager 内でシェル叩く形にしていたら Manager の prompt が肥大化し、
  agent per role の分離が薄まっていた。分離しておくと Phase 5.1 の
  Agents タブ Live section で "verify running / verify pass / verify
  needs-rework" が 1 job として観測可能。
- **escalate の context 組み立て**を worker prompt で指示した。理想的には
  Ithyno server が「escalate に必要な context を組み立てて post」する
  helper endpoint を出せば worker が薄くなるが、今のところ curl 生 叩き
  で十分。将来 escalate の頻度が上がったら convenience endpoint を
  検討。

## 🌱 Follow-ups

- **`docs/ideas/2026-07-08-verify-command-per-project.md`** — Fable MEDIUM
  #6 に沿って verify の Node 決め打ちを解消するアイデア。`agents.yaml`
  の verify 定義に `command` field or role 特化 override を追加。
- **Phase 4.2 `add-manager-loop-skill`** — Manager 本体。今回の 4 worker
  を dispatch で呼び、DispatchResult.verdict で分岐、needs-human 発生時に
  answer 待ち → 再起動、の loop を Bash + curl で組む。
- **worker が失敗した時の retry 戦略** — 現状 worker 自体は retry しない。
  Manager が dispatch の response を見て retry するかを判断する。同 change
  に対して verify が 2 回連続 fail した時に needs-human へ落とす等の
  logic は Manager 側で。
- **Sample agents.yaml の追加** — 今回 change では agents.yaml を触って
  いない (proposal で「Phase 4.2 or 5 で書く」と明記)。Phase 4.2 で
  Manager 実装と一緒に review-claude / verify-claude を declare する。

## Notes

- 新規 file 4 個 (すべて slash command markdown):
  - `.claude/commands/opsx/review.md` (~130 LOC)
  - `.claude/commands/opsx/verify.md` (~110 LOC)
  - `.claude/commands/opsx/escalate.md` (~75 LOC)
  - `.claude/commands/opsx/answer.md` (~65 LOC)
- 修正 file なし
- Tests 変わらず (234 tests、code 変更なし)
- Backward compat: 100%
- Fable review MEDIUM #5 alignment: Phase 4 を 4.1 (workers) と 4.2
  (Manager) に分割
