# 実装ロードマップ

ithyno を設計フェーズから実装へ移すための、フェーズ分割した計画。各フェーズは独立して動作確認できる単位に区切る。

---

## フェーズ 0 — プロジェクト基盤

ゴール: `npx openspec-ui` で空のサーバーが立ち、ブラウザが開く。

- [ ] リポジトリ初期化（pnpm workspace: `server` / `web` / ルート `bin`）
- [ ] TypeScript・ESLint・Prettier 設定
- [ ] Fastify サーバー雛形（ヘルスチェック `GET /api/health`）
- [ ] Vite + React + Tailwind の `web` 雛形
- [ ] CLI（`commander`）: ポート解決・サーバー起動・ブラウザ起動（`open`）
- [ ] 開発スクリプト（Vite dev + サーバー並走、プロキシ設定）

**完了条件**: ローカルで起動し、空のダッシュボードが表示される。

---

## フェーズ 1 — 読み取り専用ダッシュボード（MVPの土台）

ゴール: `openspec/` をパースして進捗を**閲覧**できる。

- [ ] ドメインモデル（`model.ts`）定義
- [ ] パーサ: `tasks.md`（remark + position による行番号取得）
- [ ] パーサ: `proposal.md` / `design.md` / delta `spec.md` / `specs/`
- [ ] ワークスペーススキャナ（`changes/` 優先、`archive/` は遅延）
- [ ] `GET /api/state` 実装
- [ ] Overview画面（changeカード + 進捗バー + 全体サマリ）
- [ ] Change詳細画面（Tasks/Proposal/Design/Delta タブ、閲覧のみ）
- [ ] Specsブラウザ（Given-When-Then整形表示）
- [ ] パース失敗時の生テキストフォールバック

**完了条件**: 実在するOpenSpecプロジェクトを開き、進捗が正しく可視化される。

---

## フェーズ 2 — 双方向同期（プロジェクトの核心）

ゴール: UIのチェックボックスでファイルが書き換わり、外部編集がUIに反映される。

- [ ] `surgicalEdit.ts`: 状態1文字のみ置換する厳格な正規表現（`/^(\s*[-*]\s*\[)[ xX](\]\s+)/`）
- [ ] `surgicalEdit.ts` 単体テスト（マルチラインタスク／タブインデント／`*` マーカー／大文字 `X` を網羅）
- [ ] 楽観的ロック（baseHash 照合）＋ `expectedText` フォールバック（行ズレ自動補正、真の競合のみ 409）
- [ ] `POST /api/tasks/toggle` 実装（`baseHash` + `expectedText` ペイロード）
- [ ] chokidar watcher（`awaitWriteFinish` 有効化）
- [ ] エコー抑制（書き込み後ハッシュ記録 → 自己発火無視）
- [ ] 外部編集の差分パース → WebSocket push
- [ ] クライアント: Zustand ストア + WSハンドラ（state-replaced / change-updated）
- [ ] UI: 楽観的更新 + 409時の局所再確認（インライン「もう一度チェック」）、外部更新の点滅表示

**完了条件**: UI操作 → Markdownに最小diff。AIがファイルを編集 → UIが即追従。同時編集で競合が安全に処理される。

---

## フェーズ 3 — カンバン & 体験向上

ゴール: 視覚的な進捗管理体験を仕上げる。

- [ ] Tasksカンバン（Todo/Done 2列、`@dnd-kit`、ドロップ=toggle）
- [ ] セクション折りたたみ・フィルタ（未完のみ表示 等）
- [ ] 「AIが編集中（Writing…）」軽量WSイベント + バッジ表示（architecture 6.5）
- [ ] Archive一覧（遅延ロード）
- [ ] キーボード操作・アクセシビリティ
- [ ] ダーク/ライトテーマ

**完了条件**: 日常の進捗管理がUIだけで快適に回る。

---

## フェーズ 4 — 配布と仕上げ

ゴール: 誰でも `npx openspec-ui` で使える。

- [ ] サーバーが `web` のビルド成果物を静的配信（単一プロセス起動）
- [ ] SPAフォールバック: `/api/*` 以外の GET を `index.html` に返す（`/change/:id` 直アクセス・リロードで404を出さない）
- [ ] npm パッケージ化（`bin` 登録・`files` 絞り込み）
- [ ] README の使い方更新・スクリーンショット
- [ ] エラーハンドリング（`openspec/` 不在時の案内など）
- [ ] ライセンス決定

**完了条件**: 公開可能な npm パッケージとして動作する。

---

## 将来検討（v1スコープ外）

- Git連携: change/タスクごとに最終コミット・担当者を表示。
- 仕様本文（requirement/scenario）の編集。
- VS Code / Cursor 拡張版（同じサーバーロジックを WebView から利用）。
- マルチリポジトリ / リモート閲覧。

---

## マイルストーン判断

最小で価値が出るのは **フェーズ2完了時点**（双方向同期が動く＝idea.mdのコア体験）。
まずは フェーズ0→1→2 を最優先で通し、3・4は利用しながら調整する。
