# Tasks

## 1. Source-of-truth confirmation

- [x] 1.1 Verify `icon.png` at repo root: 1268×1280 RGBA PNG (per `file icon.png`). Confirm it is committed as the canonical source.
- [x] 1.2 If the source's non-square aspect is problematic (e.g., visible padding in circular platform crops), note as a follow-up for the maintainer to supply a pre-cropped square source. This change proceeds with square-cropping via `fit: contain` transparent-padding.

## 2. Build-icons script

- [x] 2.1 Add `sharp` (`^0.33.x` or latest LTS) and `png2icons` as root devDependencies via `npm install --save-dev sharp png2icons`.
- [x] 2.2 Create `scripts/build-icons.mjs`. Structure:
  - Read `icon.png` from repo root.
  - Square-crop to 1024×1024 with `fit: "contain"` and transparent background as an in-memory buffer.
  - Emit PNG targets via `sharp(...).resize(w, h).toFile(path)`:
    - `web/public/favicon.png` (32×32)
    - `web/public/apple-touch-icon.png` (180×180)
    - `electron/build/icon.png` (512×512)
    - `vscode-extension/icon.png` (128×128)
  - Emit ICO via `png2icons.createICO(pngBuffer, png2icons.BILINEAR, 0, false)` — multi-size 16/32/48/64/128/256:
    - `web/public/favicon.ico` (subset: 16/32/48 — smaller)
    - `electron/build/icon.ico` (full: 16/32/48/64/128/256)
  - Emit ICNS via `png2icons.createICNS(pngBuffer, png2icons.BILINEAR, 0)`:
    - `electron/build/icon.icns` (16/32/64/128/256/512/1024)
  - Ensure output directories exist (`mkdirSync({ recursive: true })`).
  - Log each emitted target path.
- [x] 2.3 Add root npm script `"build:icons": "node scripts/build-icons.mjs"`.
- [x] 2.4 Run `npm run build:icons`. Confirm all 7 target files are created and non-empty. Manually inspect: `file web/public/favicon.png` returns PNG 32×32; `file electron/build/icon.icns` returns Mac OS X icon; `file electron/build/icon.ico` returns MS Windows icon.

## 3. Web favicon wiring

- [x] 3.1 Update `web/index.html` `<head>`: add three `<link>` tags for favicon.png, favicon.ico, apple-touch-icon.png (per proposal). Order: `image/png` first (modern browsers pick this), `image/x-icon` fallback, apple-touch-icon last.
- [x] 3.2 Confirm Vite copies `web/public/*` into `web/dist/` on build (default Vite behavior — files under `public/` land at web root).
- [x] 3.3 Confirm `server/index.ts`'s `@fastify/static` root at `webDist` serves `/favicon.png` etc. correctly on `http://localhost:PORT/favicon.png`.

## 4. Electron icon wiring

- [x] 4.1 Update `electron/package.json` `build.mac`: `{ "icon": "build/icon.icns", ...(existing fields) }`.
- [x] 4.2 Update `electron/package.json` `build.win`: `{ "icon": "build/icon.ico", ...(existing fields) }`.
- [x] 4.3 Update `electron/package.json` `build.linux`: `{ "icon": "build/icon.png", ...(existing fields) }`.
- [ ] 4.4 Verify `electron-builder` picks up the icons on `npm --workspace ithyno-electron run package:mac`. Inspect the built `.app`'s `Contents/Resources/electron.icns` — confirm it's the ithyno icon, not the default Electron atom.

## 5. VS Code extension icon wiring

- [x] 5.1 Update `vscode-extension/package.json`: add `"icon": "icon.png"` as a top-level field.
- [x] 5.2 Confirm `vscode-extension/scripts/prepack.mjs` (or the `package` script) stages `vscode-extension/icon.png` into the vsix. `vsce package` picks up the `icon` field automatically and includes the file.
- [ ] 5.3 Run `npm --workspace ithyno-vscode run package`. Unzip the produced `.vsix` and confirm `extension/icon.png` is present. Confirm `extension/package.json` inside the vsix references it.

## 6. Commit generated files

- [x] 6.1 Confirm `.gitignore` does NOT block the generated icon paths (`web/public/favicon.*`, `electron/build/icon.*`, `vscode-extension/icon.png`). If any block exists, remove the pattern for these specific paths.
- [x] 6.2 `git add web/public/favicon.png web/public/favicon.ico web/public/apple-touch-icon.png electron/build/icon.icns electron/build/icon.ico electron/build/icon.png vscode-extension/icon.png` — stage all 7 targets. The Manager-commit step (in the archive skill's Section 6) will commit them alongside the archive.

## 7. Regression test

- [x] 7.1 Create `scripts/build-icons.test.mjs`. Steps:
  - Compute a temporary sandbox directory (`node:fs.mkdtempSync`).
  - Copy `icon.png` and the build script into the sandbox.
  - Run the script from that sandbox.
  - Assert every expected output file exists and its first 8 bytes match the format's magic:
    - PNG: `89 50 4e 47 0d 0a 1a 0a`
    - ICO: `00 00 01 00 xx 00` (icon type header)
    - ICNS: `69 63 6e 73` ("icns")
  - Report pass/fail.
- [x] 7.2 Wire the test into `npm test` (via vitest include glob) so `Manager verify` catches regressions in the build-icons script.

## 8. Verification

- [x] 8.1 `npm run openspec -- validate add-app-icon-branding --strict` passes.
- [x] 8.2 `npm test` passes (including new test in 7.1).
- [x] 8.3 `npm run typecheck` passes.
- [x] 8.4 `npm run build` passes.
- [x] 8.5 `npm run build:icons` on a clean tree produces all 7 targets. Second run is byte-identical (deterministic).
- [ ] 8.6 Manual (web): `npm run dev` → open in browser → tab shows the ithyno icon (not the default globe).
- [ ] 8.7 Manual (Electron macOS): `npm run electron:dev` → macOS Dock shows ithyno icon (not the default Electron atom). `Cmd+Tab` switcher shows the icon.
- [ ] 8.8 Manual (Electron packaged mac): `npm --workspace ithyno-electron run package:mac` → open the built DMG → confirm the `.app`'s Finder icon is the ithyno icon.
- [ ] 8.9 Manual (VS Code): install the produced `.vsix` in a VS Code instance → Extensions panel shows the ithyno icon next to the extension name.
- [ ] 8.10 Regression: edit `icon.png` (e.g., color-tint it), re-run `build:icons`, restart Electron dev + refresh browser → new icon visible on all surfaces.
- [x] 8.11 Write `openspec/changes/add-app-icon-branding/outcome.md` (✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups). Follow-ups: consider adding a pre-commit hook that runs `build:icons` if `icon.png` changed; consider a follow-up for a dedicated "dark-mode variant" icon if the current single icon doesn't work on both light/dark taskbars.
