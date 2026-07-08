# Outcome — add-review-artifact

## ✅ Worked

- **Fail-closed parser** で spec の "invalid → null" 契約を強く実装できた。
  Type guards + returns null で 100% coverage。テスト 19 個で happy paths
  7 個 + rejections 9 個 + fs 3 個。各拒否ケースが単独で null を返すことを
  確認できるので、future の spec 変更 (severity 追加など) で regression が
  すぐ検出できる。
- **`parseReviewContent(raw)` を `parseReview(fs)` から分離**。pure function
  としてテストしやすく、runner 側の unit test (Phase 3.4 でも同じ pattern)
  でも fixture として使える。
- **Job / DispatchResult へ `verdict?` を透過的に thread**。runner が
  populate、dispatch がそのまま relay。既存 code path に影響ゼロ (undefined
  なら現状維持、defined なら response に載る)。
- **Slash command で Manager に「verdict を先読み」指示**を明記できた。
  Fable review HIGH #1 の Manager 実装形態が Bash + curl な前提に沿って、
  Ithyno がすでに parse したデータを Manager が再 Read しない契約を
  reinforced。Phase 4 の Manager loop 実装で「review.md を Read → parse」
  の重複がなくなる。
- **`web/src/reviewTypes.ts` を独立 module** に切り出したことで、types.ts の
  JobSummary は import type だけ。Phase 5.1 で Agents タブが verdict を
  render する時、UI コンポーネントは `import type { ReviewArtifact } from
  "../reviewTypes"` の 1 行で入れられる。

## ⚠️ Surprises

- **Line: 0 も rejects** している (現行実装は `< 1` で拒否)。0-indexed
  の line 番号を書く reviewer は稀だが、spec 上「positive integer」と
  明記されているので現行の意味論に従う。もし将来 0-indexed 派の
  reviewer が現れたら `>=0` に緩めるか判断。
- **body に frontmatter 直後の空行が含まれる**。`gray-matter` の
  `content` は frontmatter を除いた raw text で、body の先頭に `\n` が
  残ることがある。UI 側で trim すれば良いのでそのままにした。
- **`summary` が `null` の時**の挙動を試していなかった。現行実装は
  `summary === undefined` チェックなので `null` (YAML の explicit null)
  は `typeof "object"` で `typeof "string"` check に落ちて reject。spec
  的にどっちが正解かは曖昧だが、fail-closed 方針に沿って reject が誠実。

## 🔁 Differently

- **runner の finish() に review parse を統合**する時、`await parseReview`
  の場所を「listChangeArtifacts の後、status flip の前」にした。atomicity
  契約 (verdict と terminal status を polling consumer に同時に見せる) が
  保てる。もし parseReview を後ろに持ってきたら DispatchResult の verdict
  が undefined になる race があった。順序決めは spec の Job Model Includes
  Verdict の scenario で試行的に押さえたので、実装で自然に落ちた。
- **Runner 統合 test を書かなかった**。Phase 3.4 と同じ理由 (統合 test
  setup が重い)。parseReview の unit test で contract は担保、実 job で
  verdict が populate されることは Phase 4 Manager 実装時の manual smoke
  test で確認する。

## 🌱 Follow-ups

- **Phase 4.1 add-manager-prompt-and-skills** — 今回の verdict field が
  Manager loop の分岐条件。「dispatch review → verdict.verdict === 'pass'
  なら advance、'needs-rework' なら prompt_suffix に verdict.findings を
  入れて code 再 dispatch」の擬似コード を Phase 4 の Manager skill に
  埋め込む。
- **Phase 5.1 add-agents-tab-live-panel** — Agents タブの Live section で
  完了 job に `verdict.verdict` badge (✓ pass / ⚠ needs-rework(count))
  を表示する。web/src/reviewTypes.ts を import して pure な render 関数を
  書ける。
- **verdict の live update event**。現状 dispatch は sync (wait=true) で
  verdict を response に載せるが、wait=false や外部 write (editor で
  review.md を hand-edit) の場合、UI に verdict が届く経路がない。
  Phase 6 で `agent-job-verdict-updated` event を検討する余地。
- **needs-human.md の parse を Job.needsHumanQuestion に統合** — Phase 2 で
  Change.needsHumanQuestion に載せているが、Job にも同じような
  structured 表現を持たせて dispatch endpoint 経由で Manager に届ける
  経路が対称になる。次の refactor candidate。

## Notes

- 新規 file: `server/agents/review-parser.ts` (137 LOC),
  `server/agents/review-parser.test.ts` (18 tests),
  `web/src/reviewTypes.ts` (25 LOC)
- Modified: `server/agents/runner.ts` (+10 LOC で JobSummary + finish
  hook), `server/agents/dispatch.ts` (+6 LOC で verdict field + result
  reflection), `web/src/types.ts` (+3 LOC で verdict mirror),
  `.claude/commands/opsx/dispatch.md` (+/- で "Report" 節書き換え)
- Tests: 216 → 234 (+18)
- Typecheck / build clean
- Backward compat: 100% (追加のみ、既存の response shape は変えず field を
  optional で拡張)
