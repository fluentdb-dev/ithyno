---
tags: [feature/electron, feature/vscode-extension, area/server]
---

## Why

`add-electron-shell` and `add-vscode-extension` are designed to be **the
first true parallel-agent dogfooding test** of this project. They are
independent in scope (different shell packages, different concerns) but both
make small additive changes to the root `package.json` — workspaces, scripts
— that will collide when the two worktrees merge back.

Rather than discovering that conflict during the parallel run, this small
preparation change **lays down the workspaces array, the build:server
script, and the gitignore entries** for both packages up-front, so the
parallel agents touch only their own directories.

## What Changes

- Add `"workspaces": ["electron", "vscode-extension"]` to root
  `package.json`. The directories do not exist yet; npm tolerates that and
  the workspace entries become live once the directories appear.
- Add a `build:server` npm script that emits `server-dist/` from the
  TypeScript sources via `tsc`. Both the Electron packaging path and the
  future VS Code extension packaging path use this.
- Add a `server-dist.tsconfig.json` configured for emit (the existing
  `tsconfig.json` is no-emit).
- Extend `.gitignore` with `server-dist/`, `electron/out/`,
  `electron/dist/`, `vscode-extension/out/`.
- Save a tiny `docs/architecture/parallel-shells.md` linking the electron
  / vscode-extension proposals and the folder-layout idea.

The change is intentionally surgical and contains no implementation of the
shells themselves.

## Capabilities

### New Capabilities
- `build-system`: server precompile to `server-dist/` for packaging paths
  that cannot rely on `tsx` at runtime

### Modified Capabilities
<!-- none -->

## Impact

- Root `package.json` gains workspaces array + `build:server` script
- New `server-dist.tsconfig.json` (extends root with `noEmit: false`,
  `outDir: server-dist`)
- `.gitignore` augmented
- New `docs/architecture/parallel-shells.md` (one-paragraph map)
- No code in `server/`, `web/`, `bin/`, or `templates/` is touched
- Existing `npm test`, `npm run typecheck`, `npm run build` keep working
