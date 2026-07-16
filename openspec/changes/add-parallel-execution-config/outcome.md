# Outcome — add-parallel-execution-config

## ✅ Worked

- `parallelExecution: boolean` を `agents.yaml` の top-level に足すのは
  `AgentConfig` 型の boundary が既に固まっていたおかげで表面積が小さかった。
  `registry.ts` の parse に `validateParallelExecution()` 一本、
  `publicConfig()` の返却 shape に一項目、`ServerEvent#agents-updated` の
  payload に一項目、それだけで client 全体が同期する。
- config-writer 側の `writeParallelExecution` は既存の `atomicWrite` 経路
  を素直に再利用できた。Manager singleton や runtime validation を
  ぶち抜く必要がないので `applyAgentConfigPayload` とは別関数に分けた
  方が読みやすかった (混ぜると "action" union が肥大化する)。
- `useStartFlow` の picker 撤去は、mode 決定を "override → config"
  の２段階に単純化する形になった。以前は picker が prerequisite
  failure の理由を表示する場所だったので、prerequisites を toast +
  Git panel 誘導に置き換えた。UX の情報量はやや減るが、
  parallelExecution=false (default) の一般ユーザーはそもそも
  worktree flow を通らないので実害は小さい。
- Settings tab を単一の checkbox で立ち上げたのは正解。将来
  `runtime` セレクタや `defaultCodeAgent` 等の設定を足すときの
  受け皿になる。

## ⚠️ Surprises

- `setProposalExecution` (`web/src/api.ts:119`) は client 側の呼び出し
  元がゼロになった。ただし server-side endpoint
  (`POST /api/change/:id/proposal/execution`) と proposal.md 側の
  `execution:` 記法は override として残っているので、消さずに
  dead code として置いておいた。将来 override 機能ごと落とすなら
  一緒に片付ける。
- `ExecutionPicker` の CSS block を消したら 70 行減った。picker が
  "prerequisite の disabled 理由を表示するモーダル" として肥大化して
  いたことが reify されたが、picker 削除でそこも消えたので
  副次的な cleanup にはなった。
- `parallelExecution: "yes"` みたいな non-boolean は
  `validateParallelExecution` が `throw` するので registry は
  `ok: false` を返す。既存 tests のパターン (
  `expect(cfg.error).toMatch(/parallelExecution/)`) と綺麗に噛み合った。

## 🔁 Differently

- Settings 画面は今の render を見ると、`.settings-toggle` の中で
  `<input>` の兄弟に `<span><strong>...</strong><p>...</p></span>` を
  置いた構造がやや奇妙 (label 内の block-level 要素)。ただし CSS の
  align-items: flex-start で fix していて壊れは無い。将来 toggle が
  複数になったら `<Fieldset><Toggle/>...</Fieldset>` みたいな
  component 抽出をした方がいい。
- `startTerminalFlow` の prerequisite check (terminal availability) を
  hook 関数の中で toast pushing するようにしたが、`startWorktreeFlow`
  との error handling の粒度が微妙に非対称。今後どちらかに寄せる。

## 🌱 Follow-ups

- 手動 verify 6.2/6.3/6.4 は dev server 再起動して browser 確認する
  (ChangeDetail → Kanban Start → picker が出ずに flow が走ることを
  肉眼で確認)。
- R9 で ADDED した spec requirement
  `Manager Agent Listed With Other Agents` は、Manager section 復活
  (walk-back) の反映で spec-vs-reality divergence が残っている。
  別 revert (`revert-manager-listed-with-others` あたりの scope 名で)
  を発行して片付ける。
- `setProposalExecution` client 関数の dead code 化、および
  `POST /api/change/:id/proposal/execution` endpoint の削除は、
  override 機能を将来 deprecate するときに合わせて掃除。
- Settings 画面が複数トグルに育ったら fieldset の component 化。
