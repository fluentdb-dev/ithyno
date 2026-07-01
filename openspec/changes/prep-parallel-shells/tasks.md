## 1. Workspaces declaration
- [x] 1.1 Add `"workspaces": ["electron", "vscode-extension"]` to root `package.json`

## 2. build:server script
- [x] 2.1 Add `server-dist.tsconfig.json` extending root tsconfig with `noEmit: false`, `outDir: "server-dist"`, `include: ["server"]`
- [x] 2.2 Add `"build:server": "tsc -p server-dist.tsconfig.json"` to root `package.json` scripts
- [x] 2.3 Verify `npm run build:server` produces `server-dist/index.js` and the rest of the tree

## 3. gitignore
- [x] 3.1 Append `server-dist/`, `electron/out/`, `electron/dist/`, `vscode-extension/out/` to `.gitignore`

## 4. Architecture note
- [x] 4.1 Create `docs/architecture/parallel-shells.md` linking this change, `add-electron-shell`, `add-vscode-extension`, and `docs/ideas/2026-06-29-electron-shell-folder-layout.md`

## 5. Verification
- [x] 5.1 `npm install` succeeds in the project root
- [x] 5.2 `npm run build:server` succeeds and emits `server-dist/`
- [x] 5.3 `npm run typecheck` and `npm test` continue to pass unchanged
