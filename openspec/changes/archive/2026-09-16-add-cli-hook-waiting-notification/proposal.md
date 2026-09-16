## Why

Manager CLI (Claude Code / agy 等) を長時間走らせていると、応答完了して人間の入力待ちに戻ったタイミングを見逃す。ターミナルに切り替えなおすまで気付かず、実質的に手を止めていることが多い。各 CLI は既に「応答終了 / 入力待ち」を通知する hook 機構を持っている (Claude Code の `Notification` / `Stop` hook 等) ので、それを利用してローカル OS 通知を出せば、サーバ側の port/token を一切参照せずに、そのまま OS の通知センターへ流せる。

## What Changes

- **openspec-ui init に「通知フック」インストールを追加**。init 実行時に対象 CLI の設定ファイル (Claude Code なら `.claude/settings.json` の `hooks.Notification` / `hooks.Stop`, agy なら agy の hook 相当箇所) に、ローカル通知スクリプトを叩く hook エントリを注入する。
- **クロスプラットフォーム通知スクリプトを templates に追加**:
  - `templates/scripts/notify-waiting.sh` — macOS (`osascript -e 'display notification …'`) と Linux (`notify-send`) を1本で処理
  - `templates/scripts/notify-waiting.ps1` — Windows (`BurntToast` を優先、フォールバックで `[System.Windows.Forms.NotifyIcon]`)
- **init が host OS を判定し、対応スクリプトのみを配置**。ユーザ側から見える設置先は `.ithyno/scripts/notify-waiting.{sh,ps1}` を想定 (executable bit を立てる)。
- **hook 設定は絶対パスで注入**。CLI 設定ファイルからスクリプトへのパスは init 実行時に解決した絶対パスを書き込む (相対 cwd に依存しないため)。
- **既存 hook を破壊しない冪等マージ**。CLI の設定ファイルに既にユーザ独自の hook がある場合は、そのエントリを保ちつつ ithyno エントリを追記する。`--force` でのみ ithyno エントリの上書きを許可。
- **未対応 CLI は無害にスキップ**。第一段階の対象は `MANAGER_VERIFIED = ["claude", "agy"]`。他の CLI (Codex / Copilot / Gemini / opencode / Antigravity / Cursor) は hook 機構の有無・shape 調査後に追随。今回の change には含めない。
- **サーバ / API contract は無変更**。新エンドポイント無し、in-memory state 無し、認証トークン参照無し。hook からサーバへの通信は一切発生しない。
- **通知の抑制手段を提供**。ユーザが「通知不要」の時に `.ithyno/scripts/notify-waiting.{sh,ps1}` を無効化するのが最小手順であることをドキュメント化。将来的に環境変数 `ITHYNO_NOTIFY=off` 等での抑制も検討 (今回は未実装)。

## Capabilities

### New Capabilities
- `cli-notification-hooks`: openspec-ui init が対象 CLI の hook 設定に「応答待ち → OS 通知」の hook を仕込む機能。通知スクリプトはローカル完結 (サーバ非依存)、host OS に応じて sh / ps1 が使い分けられ、既存ユーザ hook を破壊しない。

### Modified Capabilities
(none — 実装として `bin/init.js` と per-CLI scaffold ロジックに触るが、既存の `project-init` / `cross-cli-skill-installer` の要求事項の観察可能な挙動は変更しない。新規挙動はすべて `cli-notification-hooks` capability 側に閉じる。)

## Impact

- **`bin/init.js`** — 通知スクリプト配置と hook 設定注入の2ステップを追加。OS 判定分岐。
- **`templates/scripts/notify-waiting.sh`** (新規) — macOS + Linux 用通知呼び出し。
- **`templates/scripts/notify-waiting.ps1`** (新規) — Windows 用通知呼び出し。
- **`.claude/settings.json` / agy の hook 設定** — init 対象ディレクトリで書き込み対象になる (ユーザ既存 hook はマージ保存)。
- **サーバ (`server/index.ts` / `server/util/auth.ts`)** — **変更なし**。API contract, port, token いずれも一切参照しない設計。
- **既存 dashboard / manager-activity** — 変更なし。今回のスコープは「terminal → OS 通知」の直結パスのみ。dashboard 内部 UI トーストへの反映は将来別提案。
- **ドキュメント** — README / CLAUDE.md に「応答待ち通知」機能の記述を追加。
- **リスク**: `.claude/settings.json` は JSON with comments 対応。書き換えロジックがコメントを保持できるかは design.md で扱う。BurntToast 未導入 Windows ユーザには初回通知でフォールバック経路が走る。
