---
tags: [dashboard, testing]
---

# add-dummy-tab

## Why

Multi-agent dispatch (code → review) をエンドツーエンドで検証するための
「無害な最小 change」が欲しい。既存機能を触らずに revert 可能で、
Kanban の Start → dispatch → review の一連の流れを実機で観察できる。

この change は最終的に revert される前提 (`revert-add-dummy-tab`) で、
検証が終わったら痕跡なく消える設計。

## What Changes

トップナビに **Playground** タブを 1 枚追加する。中身はプレースホルダ
テキストのみ (何もインタラクションしない)。

具体的には:

- `web/src/App.tsx` の `<nav>` に `<NavLink to="/playground">Playground</NavLink>` を追加
- 同じ `<Routes>` に `/playground` route を追加
- 新規 `web/src/pages/Playground.tsx` — 見出しと段落 1 つのみ

## Impact

- **Affected specs**: `dashboard` (ADDED: Playground Tab requirement)
- **Affected code**: `web/src/App.tsx` + `web/src/pages/Playground.tsx` (新規)
- **Risk**: なし (既存 route/tab は無変更)
