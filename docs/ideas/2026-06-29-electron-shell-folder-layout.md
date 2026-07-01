---
status: shaped
tags: [feature/electron, area/server, feature/vscode-extension]
source: conversation
related:
  - openspec/changes/add-electron-shell/
  - openspec/changes/add-vscode-extension/
promoted_to: null
---

# Electron shell folder layout & shared concerns with VS Code extension

Folder-structure and build-pipeline decisions that came up while preparing
to implement `add-electron-shell`. Captured here because they overlap with
`add-vscode-extension` and inform how we run those two changes in parallel.

## Folder layout (agreed)

```
openspec-ui/
├── bin/, server/, web/, templates/, docs/, openspec/   # 既存・無変更
├── package.json            # workspaces 配列を拡張する場所
└── electron/               # 新規・独立 npm workspace
    ├── package.json        # electron-builder config + scripts
    ├── tsconfig.json       # outDir = out/
    ├── src/
    │   ├── main.ts             # app lifecycle + BrowserWindow
    │   ├── server-spawner.ts   # bin/openspec-ui.js spawn + token URL parse
    │   ├── project-store.ts    # state.json: lastProject, recent, windowState
    │   └── menu.ts             # native menu builder
    ├── out/                # tsc output (.gitignore)
    └── dist/               # electron-builder output: .dmg / .exe / .AppImage (.gitignore)
```

## Key decisions

| 項目 | 決定 |
|---|---|
| Packaging方式 | npm workspace で独立パッケージ。electron-builder の `extraResources` で `bin/`, `server-dist/`, `web/dist/`, `templates/`, `node_modules/` を同梱 |
| Server entry | 既存 `bin/openspec-ui.js` をそのまま spawn — CLI と完全に同じパス |
| Runtime resource 解決 | dev: `path.resolve(__dirname, "..", "..")` ／ packaged: `process.resourcesPath` で分岐 |
| `tsx` 依存 | packaging時は外し、**server を事前 compile** (`npm run build:server` → `server-dist/`) |
| `out/` vs `dist/` 命名 | `out/` = tsc output ／ `dist/` = 配布 installer（Electron 慣例） |

## VS Code extension との共通点と差異

| | Electron | VS Code 拡張 |
|---|---|---|
| 専用 dir | `electron/` | `vscode-extension/` |
| web 側変更 | **不要** — BrowserWindow は真の browser | 必要 — `runtime.ts` で webview detection、`api.ts` で injectPty 分岐 |
| terminal | xterm.js のまま | VS Code Terminal API に委譲 (`postMessage`) |
| 共有する変更 | root `package.json` の workspaces 配列、`build:server` script | 同上 |

## Future work（このidea からは外す）

- 自動更新（`electron-updater`）
- コード署名（Apple notarization / Windows signing certs）
- マルチウィンドウ / マルチプロジェクト同時オープン
- `tsx` を runtime 同梱する代替案（compile を選んだ）
