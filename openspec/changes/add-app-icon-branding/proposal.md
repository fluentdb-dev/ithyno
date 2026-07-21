---
tags: [branding, icon, favicon, electron, vscode-extension, build]
execution: worktree
---

## Why

`icon.png` sits at the repo root (1268×1280 RGBA) but is not wired
into any of the three shells:

- **Web dashboard**: `web/index.html` has no `<link rel="icon">`. The
  browser tab shows the default globe icon.
- **Electron**: `electron/package.json` has no `build.icon` /
  `mac.icon` / `win.icon` / `linux.icon`. `electron-builder` falls
  back to the default Electron icon (blue atom). The macOS Dock and
  Windows taskbar show the generic Electron mark.
- **VS Code extension**: `vscode-extension/package.json` has no
  `icon` field. The Marketplace listing (once we publish) would show
  a placeholder.

The single-source-of-truth is `icon.png` at repo root. This change
adds the generation pipeline + wires each surface to its
appropriately-formatted icon.

## What Changes

- **New `app-icon` capability** describing:
  - `icon.png` (repo root) is the canonical source. Any icon change
    is a single-file edit here, followed by re-running the generator.
  - The generation pipeline consumes `icon.png` and emits per-surface
    icons at specified paths.
  - Every published surface (favicon, Electron app icon, vsix
    marketplace icon) SHALL be derived from that single source.

- **New `scripts/build-icons.mjs`** — Node script using `sharp` +
  `png2icons`. Emits:
  - `web/public/favicon.png` (32×32) — modern favicon
  - `web/public/favicon.ico` (16/32/48 multi-size) — legacy IE fallback
  - `web/public/apple-touch-icon.png` (180×180) — iOS home-screen
  - `electron/build/icon.icns` (16/32/64/128/256/512/1024
    multi-resolution) — macOS Electron
  - `electron/build/icon.ico` (16/32/48/64/128/256 multi-size) —
    Windows Electron
  - `electron/build/icon.png` (512×512) — Linux Electron (electron-
    builder auto-resizes for AppImage/deb)
  - `vscode-extension/icon.png` (128×128) — VS Code Marketplace
  - Square-crop the non-square source (1268×1280 → 1024×1024 with
    transparent-padding fit: contain).

- **Root `npm run build:icons`** — invokes the script. Idempotent —
  safe to re-run.

- **`sharp` (~10-30MB) + `png2icons` (~2MB)** added as root
  devDependencies. Runtime deps unaffected.

- **Wire favicon into `web/index.html`**:
  ```html
  <link rel="icon" type="image/png" href="/favicon.png" />
  <link rel="icon" type="image/x-icon" href="/favicon.ico" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  ```

- **Wire Electron into `electron/package.json` `build`**:
  ```json
  "mac": { "icon": "build/icon.icns", ... },
  "win": { "icon": "build/icon.ico", ... },
  "linux": { "icon": "build/icon.png", ... }
  ```
  (`buildResources: "build"` is already set — electron-builder auto-
  detects `build/icon.*` even without explicit config, but declare
  it for clarity.)

- **Wire vsix into `vscode-extension/package.json`**:
  ```json
  "icon": "icon.png"
  ```
  Extension bundle already includes root-relative files via
  `prepack.mjs` staging.

- **Commit the generated files** (not gitignored). Rationale:
  - CI runs would need `sharp` install per run (~seconds → minutes
    if cache miss).
  - Fresh `git clone` + `electron:dev` shouldn't fail because
    `icon.icns` is absent.
  - Icon changes are infrequent (months apart); commit noise is
    minimal.
  - Total generated size: ~500KB-1MB, all raster.

- **`scripts/build-icons.test.mjs`** — regression test that:
  - Deletes all 7 targets.
  - Runs the script.
  - Asserts all 7 files exist with expected byte-length signatures
    (PNG/ICO/ICNS magic bytes at offset 0).

## Success

- `icon.png` is present at repo root and remains the sole source.
- `npm run build:icons` on a clean checkout regenerates every target
  file. Second run is a no-op (bit-identical output; sharp is
  deterministic).
- Web dashboard tab shows the ithyno icon (favicon).
- Electron app on macOS shows the ithyno icon in the Dock + About
  panel + `Cmd+Tab` switcher.
- Electron app on Windows shows the ithyno icon in the taskbar +
  installer + system tray.
- Electron app on Linux (AppImage) shows the ithyno icon in the
  desktop launcher.
- `.vsix` produced by `npm --workspace ithyno-vscode run package`
  bundles `icon.png` and the Marketplace listing (when published)
  shows it.
- Editing `icon.png` and re-running `build:icons` propagates the new
  icon to every surface in one command.
- `sharp` install adds no runtime dep — bundle size / packaged
  Electron / vsix size are unchanged.
