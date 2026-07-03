# OpenSpec UI

> 裏側はMarkdown、表側は進捗ダッシュボード。
> AIエージェントは生の `.md` を読み書きし、人間はブラウザUIで仕様駆動開発（SDD）の進捗を把握・操作する。

OpenSpec UI は、[OpenSpec](https://github.com/Fission-AI/OpenSpec) のディレクトリ構造（`openspec/specs/`・`openspec/changes/`）をそのまま **Single Source of Truth** として扱い、その上に被せる **ローカル起動の進捗ダッシュボード** です。

- **依存を増やさない** — 進捗データは `tasks.md` の `- [ ]` / `- [x]` に存在する。UIはそれを可視化・編集するだけ。ツールが壊れてもエディタで開発を続行できる。
- **AIと人間の両立** — AIはプレーンな `.md` を読み書きし、人間はカンバン／プログレスツリーで全体像を掴む。
- **Git がそのまま進捗の履歴** — 「誰がいつどのタスクを完了したか」はMarkdownのコミットdiffとしてGitに残る。

---

## このリポジトリの位置づけ

ロードマップ フェーズ0〜2（＋3・4の一部）を実装済みの **動作するMVP** です。

- [`idea.md`](./idea.md) — 元になったアイデアと考察。
- [`docs/architecture.md`](./docs/architecture.md) — アーキテクチャ・技術選定・データモデル・双方向同期の設計。
- [`docs/roadmap.md`](./docs/roadmap.md) — フェーズ分割した実装ロードマップ。

### Quick Start

```bash
npm install

# 開発（API: 4321 / UI: Vite 5173。UIは http://localhost:5173 を開く）
npm run dev

# 動作確認モード（web は HMR、server は watch なし。並列 agent が
# サーバ再起動で殺されない — Kanban IN-PROGRESS の Start ▾ を dogfood する時はこちら）
npm run dev:test

# 本番相当（UIをビルドして単一プロセスで配信し、ブラウザを開く）
npm run build
npm start            # = node bin/openspec-ui.js（このリポジトリのopenspec/を表示）

# 任意のOpenSpecプロジェクトを対象にする
node bin/openspec-ui.js --dir /path/to/your/project --port 4321

# テスト・型チェック
npm test
npm run typecheck
```

### 配布チャネル

同じダッシュボードを3つの経路で使えます — 好きな入口を選んでください。

| チャネル | 対象ユーザー | 起動方法 |
|---|---|---|
| **CLI + ブラウザ** | 任意のエディタ / エディタなし | `node bin/openspec-ui.js` → 既定ブラウザ |
| **VS Code拡張** | VS Code / Cursor | `npm --workspace=vscode-extension run package` → 生成された `.vsix` を「VSIXからインストール」→ コマンドパレットで `OpenSpec UI: Show Dashboard` |
| **Electronデスクトップアプリ** | Vim / JetBrains / Sublime / エディタ不問 | DMG / NSIS / AppImage をダウンロードして起動（開発は [`electron/README.md`](./electron/README.md) 参照） |

3チャネルとも中身は同じ `bin/openspec-ui.js`（Fastify + Vite build）です。Electron 版は BrowserWindow が localhost サーバーを開くだけ、VS Code 拡張は WebviewPanel が同じ URL を iframe で開くだけで、実装上の分岐はありません。VS Code 拡張の詳細は [`vscode-extension/README.md`](./vscode-extension/README.md)。

> 実装メモ: UIスタイルは依存とビルドの安定性を優先し、Tailwindではなく素のCSS（`web/src/styles.css`）で実装しています。設計意図（ユーティリティCSSで素早く組む）はそのままです。

### 埋め込みターミナル（ChangeDetailの右ペイン）

ChangeDetail画面に **本物のシェル** をxterm.jsで埋め込んでいます。サーバーがPTYを `spawn` し、ブラウザのターミナルとstdin/stdoutを橋渡しします。ターミナル内で `claude` や `/opsx:apply` を実行すると、編集が `tasks.md` に反映されて**同じ画面のカンバンが即追従**します。

**起動シェルの選択（OS別の既定）**

| OS | 既定 |
|---|---|
| macOS / Linux | `$SHELL`（未設定なら `/bin/bash`） |
| Windows | `pwsh.exe`（PATHにある場合）、なければ `powershell.exe` |

環境変数 `OPENSPEC_UI_SHELL` で上書きできます。例：

```bash
# 起動直後に Claude Code を直接出す
OPENSPEC_UI_SHELL=claude npm start
```

**ローカル限定**：ターミナルは実シェルをWebSocketに繋ぐため、サーバーは `127.0.0.1` バインドで起動し、`/pty` upgradeは **localhost からのみ受け付け**ます（非ローカル接続は接続自体を破棄）。リモート公開は意図的にサポートしていません。

### セキュリティモデル（CSRF 対策）

Fastify は `127.0.0.1` バインドですが、それだけでは **ブラウザで開いた悪意あるページ** が `fetch("http://localhost:<port>/api/pty/inject", ...)` を叩く攻撃（TCP は local だが Origin は他サイト）を防げません。そこで 3 層で守っています：

1. **セッショントークン** — サーバー起動時に 32 バイトの hex を生成し、起動 URL (`?token=...`) に埋め込む。ミューテーション系エンドポイントは token 一致を要求。
2. **Origin allow-list** — `http://localhost:<port>` / `http://127.0.0.1:<port>` / `http://[::1]:<port>` / `vscode-webview://*` のみ許可。ブラウザは Origin を偽装できないので他サイトからの fetch は 403。
3. **Content-Type チェック** — `application/json` 以外は拒否。`<form>` からの CSRF を単純に落とす。

各層は独立しているため、1 つ失敗しても他が守ります。詳細は `openspec/specs/csrf-protection/spec.md`。

**PTYバックエンドが無い環境**：ネイティブモジュール（`@homebridge/node-pty-prebuilt-multiarch`）のロードに失敗した場合、ダッシュボードは通常どおり起動し、`/api/health` が `terminal.available: false` を返してターミナルペインは表示されません（グレースフル劣化）。

### Windows / WSL ユーザーへの重要事項

WindowsでClaude Codeを使う場合、**OpenSpec UIサーバーとClaude Codeを同一環境で起動**してください。

- ✅ 両方ともWSL内（推奨）
- ✅ 両方ともWindowsネイティブ
- ❌ 片方だけWSL（chokidarのファイル監視がWSL↔Windows境界をまたぐと不安定で、カンバンがClaudeの編集に追従しません）

PTYはWindows 10 1809+ の **ConPTY** を使用します。`@homebridge/node-pty-prebuilt-multiarch` がprebuiltを提供しているため通常はビルド不要ですが、prebuiltが無いNodeバージョンを使う場合は Visual Studio Build Tools が必要になります。その場合はターミナルを無効化（PTYロード失敗時に自動でスキップ）したまま使うこともできます。

### ドッグフーディング（OpenSpec で OpenSpec UI を開発する）

このリポジトリ自身が **本物のOpenSpec**（`@fission-ai/openspec`）で仕様駆動開発されています。

- リポジトリ直下の [`openspec/`](./openspec/) が**このプロジェクトの実仕様**です。`npm start` でダッシュボードを開くと、自分自身の開発タスクが表示され、UIからチェックして進められます。
  - `specs/`：実装済みアーキテクチャの現行仕様（`markdown-sync` / `dashboard` / `openspec-parsing`）
  - `changes/`：未着手の提案（`add-kanban-view` / `add-task-filter` / `add-writing-status`）
- 動作確認用のサンプル（架空データ）は [`examples/sample-project/openspec/`](./examples/sample-project/) に分離。`npm run demo` で表示できます。
- OpenSpecのワークフロー：`npm run openspec -- list` / `npm run openspec -- validate --all`。新しい変更は `/opsx:propose` で起こせます（`.claude/` にコマンド導入済み）。

```bash
npm start                       # 自分自身の openspec/ を表示（ドッグフーディング）
npm run demo                    # examples/ のサンプルを表示
npm run openspec -- validate --all
```

---

## コンセプト（要約）

```
            ┌─────────────────────────────────────────────┐
            │                  ブラウザUI                   │
            │   Overview / Change詳細 / Specsブラウザ        │
            │   ・進捗バー  ・カンバン  ・チェックボックス操作  │
            └───────────────▲───────────────┬──────────────┘
                    WebSocket (push)   │ REST (toggle)
            ┌───────────────┴───────────────▼──────────────┐
            │            ローカルサーバー (Node)              │
            │   Markdownパーサ / 行単位サージカル編集 /        │
            │   chokidar File Watcher / エコー抑制            │
            └───────────────▲───────────────┬──────────────┘
                  watch (AIの変更)     │ 最小diff書き込み
            ┌───────────────┴───────────────▼──────────────┐
            │   openspec/  (Single Source of Truth, .md)    │
            │   specs/**/spec.md   changes/**/tasks.md ...   │
            └────────────────────▲──────────────────────────┘
                                 │ 直接読み書き
                          AIエージェント (Claude / Cursor 等)
```

人間がUIのチェックボックスをクリック → サーバーが `tasks.md` の該当行だけを `- [ ]` ⇄ `- [x]` に書き換え → Gitにdiffが残る。
AIがファイルを更新 → File Watcherが検知 → UIへ即時push。

詳細は [`docs/architecture.md`](./docs/architecture.md) を参照。

---

## 実装状況（ロードマップ対応）

- ✅ フェーズ0: プロジェクト基盤（CLI / Vite / Fastify）
- ✅ フェーズ1: 読み取り専用ダッシュボード（パーサ・`GET /api/state`・Overview/詳細/Specs）
- ✅ フェーズ2: 双方向同期（サージカル編集・`expectedText`楽観ロック・chokidar+エコー抑制・WebSocket）
- 🚧 フェーズ3/4: SPAフォールバック・静的配信は実装済み。カンバン・「編集中」表示・npm公開は未着手。

---

## ライセンス / ステータス

- ステータス: **動作するMVP**
- ライセンス: 未定
