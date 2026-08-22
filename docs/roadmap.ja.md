# 実装ロードマップ

ithyno の実装計画。現在の基準バージョンは `0.8.1-alpha.1`。
個別機能の詳細な仕様と進捗は `openspec/changes/` を正とし、この文書では
プロダクト全体の到達状況をフェーズ単位で示す。

---

## フェーズ 0 — プロジェクト基盤

ゴール: ローカルサーバーを起動し、ブラウザでダッシュボードを表示できる。

- [x] npm workspaceによるプロジェクト構成（server / web / Electron / VS Code Extension）
- [x] TypeScript・ESLint設定
- [x] Fastifyサーバーとヘルスチェック
- [x] Vite + Reactによるwebクライアント
- [x] CLIからのポート解決・サーバー起動・ブラウザ起動
- [x] Vite dev serverとAPIサーバーを使用する開発スクリプト

**完了条件**: ローカルで起動し、ダッシュボードが表示される。— **完了**

---

## フェーズ 1 — 読み取り専用ダッシュボード

ゴール: `openspec/` をパースして進捗を閲覧できる。

- [x] ドメインモデル定義
- [x] `tasks.md` パーサとタスク進捗の集計
- [x] proposal / design / delta spec / current specのパース
- [x] active changeとarchiveのワークスペーススキャン
- [x] ワークスペースstate API
- [x] Overview画面（changeカード・進捗バー・全体サマリ）
- [x] Change詳細画面（Tasks / Proposal / Design / Specs）
- [x] Specsブラウザ
- [x] Archive・Tags・Docs表示
- [x] パース失敗時のフォールバック表示

**完了条件**: OpenSpecプロジェクトを開き、仕様と進捗を正しく可視化できる。— **完了**

---

## フェーズ 2 — 双方向同期

ゴール: UI操作でMarkdownが更新され、外部編集がUIへ反映される。

- [x] チェック状態のみを置換するサージカル編集
- [x] マルチライン・インデント・リストマーカーを保護する単体テスト
- [x] `baseHash`と`expectedText`による楽観的ロック
- [x] タスク更新API
- [x] chokidar watcherと`awaitWriteFinish`
- [x] サーバー自身の書き込みに対するエコー抑制
- [x] 外部編集の差分パースとWebSocket通知
- [x] クライアントstateとWebSocketイベントの同期
- [x] 競合時に無関係なMarkdownを上書きしない処理

**完了条件**: UI操作はMarkdownへ最小差分として反映され、AIなどによる外部編集にもUIが追従する。— **完了**

---

## フェーズ 3 — ダッシュボードUX

ゴール: 日常的なChange管理をダッシュボード上で完結できる。

- [x] Kanban・lane・list表示
- [x] Change検索とフィルター
- [x] Change作成・dispatch・archive・merge・discard操作
- [x] Diff表示
- [x] Archive一覧
- [x] 外部編集・Agent実行状態の表示
- [x] ダーク / ライトテーマ
- [ ] キーボード操作とアクセシビリティの包括的な確認
- [ ] ダイアログのフォーカス喪失・復帰動作の追加検証

**完了条件**: 主要操作は実装済み。アクセシビリティとウインドウ状態遷移の検証を継続する。— **一部継続**

---

## フェーズ 4 — 配布クライアント

ゴール: 利用環境に応じてVS Code ExtensionまたはElectron Appから利用できる。

- [x] サーバーからwebビルド成果物を静的配信
- [x] SPAフォールバック
- [x] VS Code Extension
- [x] Electron App
- [x] プロジェクト初期化UIとPrerequisites検出
- [x] macOS / Windows / Linux向け成果物のビルド構成
- [x] GitHub Releases向けリリースフロー
- [x] GitHub PagesによるInstallation・初期操作・トラブルシューティング
- [ ] 各OSのリリース成果物を使用した継続的なインストール確認
- [ ] npm経由の一般利用を正式な配布経路として提供するか判断

**完了条件**: alpha成果物は生成可能。各OSでの実機検証を継続する。— **alpha提供中**

---

## フェーズ 5 — マルチエージェント実行

ゴール: Managerが役割ごとのWorkerへOpenSpec Changeを安全に委譲できる。

- [x] `agents.yaml`によるManager / code / review / verify設定
- [x] ManagerターミナルとWorkerのsingle-prompt実行
- [x] worktreeによるChange単位の隔離
- [x] code → review → verifyの順序制御と成果物契約
- [x] AgentRunnerによる異種CLI Workerの実行
- [x] 同一phaseの異なるChangeを対象とした並行実行
- [x] Claudeを正とするCLI別Skill / Command / Workflow生成
- [x] SettingsからのOpenSpec・ithyno Skill管理
- [ ] Codexのネイティブsubagent委譲とmodel指定の最終検証
- [ ] Agyの`invoke_subagent`経路と非対応Manager → Agy経路の最終整理
- [ ] Manager / Worker対応表の継続的な回帰テスト

**完了条件**: READMEに記載した対応経路が再現可能で、未対応経路は実行前に明確に拒否される。— **安定化中**

---

## フェーズ 6 — セッションと実行の安定化

ゴール: リロード、プロジェクト切替、長時間実行でもManagerとWorkerの状態を失わない。

- [x] プロジェクト切替時のManager PTY再生成
- [x] Dashboard sessionのport / token伝搬
- [x] tmux起動時のithyno環境変数伝搬
- [x] Worker完了待機と成果物判定
- [x] review / verify成果物のworktree対応
- [ ] 同一session復旧時と新規session生成時のcredential境界を継続検証
- [ ] 起動無応答timeoutとWorker実行timeoutの分離を完了
- [ ] cancellation・異常終了・transport failureのUI診断を改善

**完了条件**: 古いportやtokenを使用せず、実行中・timeout・失敗をUIとログから区別できる。— **安定化中**

---

## 次期候補

- [ ] GitHub Copilot対応の拡張
- [ ] dotenvxを利用した開発環境変数マネージャー
- [ ] 外部Skillの検出・インストール・更新・削除
- [ ] Agent harnessごとのargs builder
- [ ] tmux設定と操作のGUI改善
- [ ] Claude Code session間通信の確認と文書化
- [ ] Agent CLIごとのmodel・approval・sandbox設定支援
- [ ] SkillとAgent環境の互換性を検査するテスト機構

---

## 将来検討（1.0以降）

> **AI-drafted ideas:** この節は、現在の設計と開発中に得られた知見を
> もとにAIが作成した将来案であり、採用決定済みの仕様やリリースへの
> コミットメントではない。実装前に、人による必要性・優先度・安全性の
> 判断とOpenSpec proposalを必要とする。

- マルチリポジトリとリモート閲覧。
- マルチユーザー共同作業と、より強い同時編集制御。
- requirement / scenario本文の編集。
- Agent実行履歴、model、コスト、処理時間の可視化。
- 外部workflow providerとAgent harnessの拡張ポイント。
- 実行時に使用したCLI・model・Skill・設定のスナップショット保存と、
  Change単位での再現性・監査性の向上。
- ローカル実行を基本としたまま選択的に利用できるremote Workerと
  self-hosted runner。
- 組織内で共有できるworkflowテンプレートと、信頼元・署名・versionを
  検証する配布形式。

---

## 1.0判断

1.0では、新機能数よりも次を優先する。

- `agents.yaml`、Skill、成果物、Manager → Worker routingの互換契約が安定している。
- ドキュメントに記載された初期化とmulti-agent workflowをE2Eで再現できる。
- macOS / Windows / Linuxの成果物でインストールと基本操作を確認できる。
- 設定ファイルと生成ファイルに対する移行手順がある。
- 未対応のCLI経路や不足しているPrerequisitesを実行前に説明できる。
