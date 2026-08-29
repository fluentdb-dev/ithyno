## Context

Ithyno は Manager CLI (Claude Code / agy 等) を PTY 経由で長時間走らせる。応答完了して人間の入力待ちに戻ったタイミングを検知したいが、既存アプローチには不便がある:

- PTY のバイト列を監視して BEL / silence heuristic で判定する案 → 誤検知が出やすい (長い実処理と区別困難)。
- サーバ側で `manager-activity` の `waiting` を利用する案 → dispatch orchestration ロジックが public する semantic state であって、Manager PTY で人間を待っている状態そのものとはズレる (dispatch waits worker vs. CLI waits human)。

対して各 CLI は自分自身で「今 waiting だ」を最も正確に知っている。Claude Code なら `Notification` hook (60秒 idle + permission 待ちで発火) と `Stop` hook (応答完了) が既にある。これを叩けば、CLI 自身がベストタイミングでシェルコマンドを実行してくれる。

そのシェルコマンドは "ローカル通知を出すだけ" にできる。ithyno サーバに HTTP POST する必要はなく、host OS の通知センターに直接投げるだけで十分。この場合サーバの port / auth token を hook 側が参照する必要が完全に無くなり、既存 API contract は一切触らずに済む。

現状の init 実装 (`bin/init.js`) は `templates/**` を walk して target に copy する構造。`copyFile` は skip / overwrite / create を返す冪等な小関数。今回の feature はこれとほぼ同じパターン (scaffold + 冪等マージ) で書ける。

対象ユーザは openspec-ui init 済みのプロジェクトで Manager CLI を運用するユーザ。第一段階の対象 CLI は `MANAGER_VERIFIED = ["claude", "agy"]` に揃える (Manager 候補として検証済のみ)。他 CLI は hook 機構の有無・shape 調査後に追随する。

## Goals / Non-Goals

**Goals:**
- CLI 自身の hook 機構を利用して "応答待ち → OS 通知" を実現する。
- 通知経路をローカル完結にし、サーバの port / auth token 参照を発生させない。
- host OS (macOS / Linux / Windows) を跨いで動く通知スクリプトを提供する。
- 既存ユーザ hook を破壊しない冪等マージを init に組み込む。
- 未対応 CLI があっても init 全体を壊さない (対象外 CLI は素直にスキップ)。

**Non-Goals:**
- dashboard 内部 UI トーストへの反映 (SSE 経路の追加)。将来別提案。
- PTY 側 BEL / silence heuristic のフォールバック実装。将来別提案。
- 通知内容の高度なカスタマイズ (テンプレート / ユーザ設定画面等)。今回は固定文言 + 環境変数フォールバックまで。
- CLI 側 hook 機構のクロスプラットフォーム挙動差 (Windows で hook が動くかどうか) の網羅検証。まず macOS/Linux を primary、Windows は BurntToast 導入前提の best-effort。
- 通知全体の on/off UI。今回はスクリプト無効化 = 通知停止、というシンプル契約に留める (`ITHYNO_NOTIFY=off` 環境変数対応も含めない)。

## Decisions

### D1. hook イベント種別: Claude Code は `Notification` + `Stop` の両方を登録

`Notification` hook: 60秒 idle 待ち + permission 待ちで発火。「人間の応答を待っている」意味論に最も近い。
`Stop` hook: 応答が終了したタイミング (waiting 状態への遷移そのもの)。

両方を登録することで、"応答が終わった瞬間" と "その後暫く応答なしで待ち続けている状態" の両方をカバーする。片方だけだと、応答完了通知が短時間で消えてしまい席を離れているユーザが気付けない、逆に idle notification だけだと 60秒待たされる。両方を同じスクリプトが受けても副作用は「通知が2回出る」だけで、実害は小さい。

代替: `Stop` のみ → 完了直後だけの1回通知。快適だが Claude が permission 待ち等で早期に notification を出すケースを取り零す。今回は user attention 最大化を優先。

### D2. hook からサーバへは POST しない (ローカル通知スクリプト直呼び)

hook スクリプトは `osascript` / `notify-send` / BurntToast を直接呼ぶ。ithyno サーバへの HTTP は発生しない。

理由:
- サーバ port は動的 (Electron 起動ごと)。auth token も per-process。両方 hook スクリプトから参照するには rendezvous ファイル or 環境変数注入が必要 → 追加設計 → 壊れやすい。
- 「ローカル通知を出す」目的だけを考えれば hook 内で OS ネイティブ通知を叩けば十分。サーバ経路は不要な複雑性。
- サーバ経路が要るのは "dashboard 内 UI トースト" を出したい時のみ。それは Non-Goals として将来提案に分離。

代替: サーバ endpoint 追加 + SSE fan-out → 却下 (Non-Goals)。

### D3. host OS 判定は init 実行時 (scaffold 時)、hook 実行時ではない

`bin/init.js` が `process.platform` を見て、macOS/Linux なら `notify-waiting.sh` のみを配置、Windows なら `notify-waiting.ps1` のみを配置する。hook 設定に注入するパスも OS に応じたスクリプト絶対パスになる。

理由:
- hook スクリプト内で OS 判定するのは shebang 選択の時点で無理 (sh の shebang と ps1 の第一行は別世界)。
- 実行時判定を諦めて配置時判定にすれば、それぞれの OS で最短最速の1本だけを実行できる。
- クロスプラットフォームの1本スクリプトを Node.js で書く選択肢もあるが (`child_process.spawn`)、hook 発火時の Node 起動コスト (100ms 程度) が毎回積み重なるので却下。

代替: Node.js 1本 → 起動コスト理由で却下。sh + ps1 両方配置し hook から適切な方を選ぶ dispatcher → 複雑度に見合わない。

### D4. スクリプト配置先は `.ithyno/scripts/notify-waiting.{sh,ps1}`

target project の `.ithyno/scripts/` 配下に置く。`.ithyno/` は既に .gitignore 対象 (init が保証)。executable bit (0755) を立てる。

理由:
- `.claude/` 配下に置くと agy 用 hook から参照しにくい (異なる CLI の namespace)。共通置き場を1つ持って複数 CLI hook から共有する方が拡張しやすい。
- `.ithyno/` はプロジェクトごとの scratch space として既に確立。マルチプロジェクト運用でも衝突しない。

代替: `~/.ithyno/scripts/` (グローバル) → ユーザ設定変更が全プロジェクトに波及して意外性が大きい。プロジェクトローカルの方が予測可能。

### D5. hook 設定への冪等マージ: 既存 hooks を保持し ithyno エントリを追記

`.claude/settings.json` は JSON with comments (JSONC)。既にユーザ hook がある可能性がある。init は:

1. ファイル存在すれば読み込み (JSONC パーサで tolerant に)
2. `hooks.Notification` / `hooks.Stop` が存在すれば配列末尾に ithyno エントリを追加、存在しなければ新規作成
3. ithyno エントリは `matcher: ""`, `hooks: [{ type: "command", command: "<absolute path to notify script>" }]`
4. 既に同じスクリプトパスを持つ ithyno エントリがあれば no-op (冪等)
5. `--force` 時のみ ithyno エントリの再上書き

JSONC のコメント保持は `json-source-map` や `jsonc-parser` を使う。または最小手段として「コメント有無を検出、コメントあれば warning を出しつつマージ、コメント無い純 JSON なら安全に書き戻す」の two-track で開始。

agy の hook 設定形式は agy 側の hook 実装を調査した上で決定 (agy は `.agents/` 配下、CLI ごとに独自 shape)。少なくとも Claude Code と同じセマンティクス (Notification + Stop 相当) を再現できることを検証タスクに含める。

代替: 単純上書き → ユーザ hook を破壊するので却下。

### D6. 対象 CLI は第一段階で `MANAGER_VERIFIED = ["claude", "agy"]` のみ

理由:
- ithyno は既に `web/src/components/InitDialog.tsx` で `MANAGER_VERIFIED = ["claude", "agy"]` を採用済み。同じ境界を hook installer にも適用することで、"Manager として動く CLI にのみ通知を仕込む" 明快な semantics を維持する。
- 他 CLI (Codex / Copilot / Gemini / opencode / Antigravity / Cursor) は Manager として未検証で、hook 機構の shape も未調査。今回まとめて対応すると調査コストで炎上リスク。分割する。

代替: 全対応 → 却下。1個ずつ → 却下 (claude と agy は同時に動かすユーザが多いので初回から2 CLI 対応が実利的)。

### D7. 通知文言と icon

固定文言: title `"ithyno — CLI waiting"`, body `"<CLI name> is waiting for your input"` (英語)。CLI 名は hook 側が引数として渡すか、環境変数 `ITHYNO_CLI_NAME` で受ける。

理由: 日本語 UI もあるが、通知センターは OS locale に依存するので混在。固定英語で開始し、後日 locale 対応を別提案化。

## Risks / Trade-offs

- **[.claude/settings.json のコメント破壊リスク]** → 冪等マージロジックで JSONC パーサを使う。最悪でもコメント欠落だけに留め、実 hook 設定は保持する。
- **[Windows で hook 自体が動かない CLI がある]** → Windows 対応は best-effort。BurntToast 未導入なら `[System.Windows.Forms.NotifyIcon]` フォールバックで音だけでも鳴らす。
- **[通知が過剰で邪魔]** → 第一段階では on/off UI を持たない。ユーザは `.ithyno/scripts/notify-waiting.{sh,ps1}` を chmod 000 / rename すれば止まる。ドキュメントに記載。
- **[hook 発火タイミングが CLI 更新で変わる]** → Claude Code / agy の hook API は upstream の破壊的変更に晒される。回帰検証タスクを archive 前チェックリストに含める。
- **[複数プロジェクト間で通知が重複]** → 各プロジェクト独立で hook が仕込まれるので、同時に走らせると同じ CLI 上で複数通知が出る可能性がある。第一段階では受容 (通常は Manager 1本走り)。

## Migration Plan

- init 冪等なので既存プロジェクトで `openspec-ui init` を再実行するだけで通知 hook が仕込まれる。
- ユーザ hook が既にあれば追記マージなので既存動作は温存。
- Rollback は `.claude/settings.json` の ithyno エントリ手動削除 + `.ithyno/scripts/notify-waiting.{sh,ps1}` 削除。将来 `openspec-ui uninstall-notify-hooks` を別提案で用意可。

## Open Questions

- agy の hook 設定形式 (どの JSON/YAML キー、どの発火イベント) を実装タスクで確認。少なくとも `Notification` 相当 or `Stop` 相当が無い場合、agy 対応は今回スコープから外す (change 全体を止めない)。
- BurntToast 未導入 Windows での初回体験。プロンプトを出すか、silent fallback (システム音のみ) にするか、実装時に決める。
- 通知が全部同じ文言だと複数 CLI 同時運用時にどれか分からない → hook 引数で CLI 名を渡す方式を採用予定 (`notify-waiting.sh "claude"` 等)。
