---
status: idea
tags: [feature/electron, area/ux, area/electron]
source: conversation
related:
  - openspec/changes/archive/2026-07-02-add-parallel-start-launcher/
  - openspec/changes/add-electron-shell/
promoted_to: null
---

# Electron Launch Screen

## 発端

`add-electron-shell` verify 中、初回起動でいきなり OS のフォルダピッカーが
出るのが唐突。「Launch 画面があった方が良いのでは」という感想。

## 現状挙動

1. `npm run electron:dev` で app 起動
2. main.ts が `browser-window-ready` の前に `dialog.showOpenDialog` を open
3. user が folder 選択 → server 起動 → BrowserWindow が localhost を開く
4. Cancel すると app 終了

## 課題

- **Recent MRU の使い道が薄い**: 記録はしているが、Open Recent メニューから
  しかたどり着けない。次回起動で MRU があるのに picker が出るのが冗長
- **Cancel = 終了 が意図されているか不明**: 「ちょっと閉じたい」動作の余地なし
- **Onboarding ゼロ**: 初回 user に「これは何のアプリか」を伝える機会がない

## Launch 画面案

```
┌──────────────────────────────────┐
│         OpenSpec UI               │
│                                   │
│   [ Open Project… ]               │
│                                   │
│   Recent:                         │
│   • ~/works/openspec-ui           │
│   • ~/works/sample-project        │
│                                   │
│   Learn more · Settings           │
└──────────────────────────────────┘
```

- **常に最初に表示** — Recent 有無に関わらず
- **`Open Project…`** で従来のピッカー
- **Recent list** をクリックで直接開く
- **Learn more** で README リンクを既定ブラウザで開く（or docs page）
- **Settings** は将来（起動時デフォルト port、shell 選択 等）

## 実装スケッチ

- `electron/src/launch/launch.html` の static ページを追加
- `main.ts` の `whenReady` フローを:
  1. Launch window（frameless、center、compact サイズ）を先に表示
  2. IPC で "open-project" / "open-recent(path)" を受ける
  3. project が選ばれたら Launch window を close、既存の server spawn + main window flow に接続
- Recent の永続化は既存 `store.ts`（electron-store 等使っているなら）を流用

## Open questions

- Launch window は毎回出す？ MRU 直近を「起動時自動オープン」設定で bypass できても良い（Settings 項目）
- 「+ New Project (git init from empty dir)」を出すか？ Header の Git chip
  相当の機能を Launch にも置くか
- VS Code 拡張版とは切り離した Electron 固有機能 — 分岐が増える許容

## 進め方

このアイデアは `add-electron-shell` の verify を邪魔しないので、
まず shell 側を archive 完了 → その後 `add-electron-launch-screen` として
正規に propose する。UX 決着してから実装。
