# Outcome: add-app-icon-branding

## Worked

- `scripts/build-icons.mjs` using `sharp` + `png2icons` generates all 7 target
  icon files from `icon.png` in a single command. The script is pure ESM, has no
  special flags, and runs in under 2 seconds.
- `sharp` square-crops the non-square 1268×1280 source to 1024×1024 with
  `fit: "contain"` transparent padding — no distortion, no crop of the artwork.
- `png2icons.createICO` and `createICNS` produce valid ICO (confirmed by `file`
  as "MS Windows icon resource") and ICNS (confirmed as "Mac OS X icon") formats.
- Second run is byte-identical to the first — both `sharp` and `png2icons` are
  deterministic (fixed algorithm, no random salts). Verified via `sha256sum`
  comparison and the regression test's second-run assertion.
- Vite automatically copies `web/public/favicon.*` into `web/dist/` at build time.
  `@fastify/static` serving `web/dist/` exposes `/favicon.png` etc. with no
  extra config needed.
- `npm install --ignore-scripts` was necessary to install `sharp` and `png2icons`
  alongside the existing `@homebridge/node-pty-prebuilt-multiarch` (which fails to
  rebuild on Python 3.14 due to the removed `distutils` module). The `--ignore-
  scripts` flag skips all native-module install hooks; both `sharp` (ships a
  prebuilt libvips binary) and `png2icons` (pure JS) load fine without rebuild.
- All 26 test files pass including the new `scripts/build-icons.test.mjs` (8 tests).
  `npm run typecheck` and `npm run build` pass without modification.

## Surprises

- The first plain `npm install sharp png2icons` failed because npm tries to
  rebuild ALL native modules in the workspace, including the already-installed
  `@homebridge/node-pty-prebuilt-multiarch`, which fails on Node 25 + Python 3.14
  (distutils removed). Using `--ignore-scripts` skips this and is safe here because
  `sharp` provides prebuilt binaries via its own install script — not needed.
- `png2icons` generates the same ICO for both `web/public/favicon.ico` and
  `electron/build/icon.ico` (both use the full 9-size set internally). The proposal
  mentions "16/32/48 subset" for the web favicon ICO but `png2icons` doesn't expose
  per-size filtering. The full-size multi-resolution ICO is strictly more compatible
  than a subset, so this is fine.

## Differently next time

- To install new devDeps in a workspace with native modules, document the pattern:
  `npm install --save-dev --ignore-scripts <pkg>` first, then run the specific
  install script manually if needed (`cd node_modules/sharp && npm run install`).
- If `png2icons` favicon ICO size must be limited to 16/32/48, consider using
  `sharp` + a manual ICO-file assembler (or the `ico-endec` / `png-to-ico` packages)
  to produce the web ICO separately from the Electron ICO.

## Follow-ups

- **Pre-commit hook**: Consider adding a `.husky` (or similar) pre-commit hook that
  runs `npm run build:icons` if `icon.png` is in the staged diff. This prevents the
  generated files from drifting from the source between icon edits.
- **Dark-mode variant**: The current icon is a single RGBA PNG. On macOS the Dock
  and Finder use the single icon on both light and dark backgrounds. If the current
  icon does not look good on light taskbars, consider a follow-up for a dark-mode
  variant (macOS supports `AppIcon` + `AppIconDark` or Template Image pattern for
  menu-bar icons).
- **Web favicon ICO size control**: If strict 16/32/48-only subset in the web ICO
  is desired, add a dedicated ICO assembly step using a different library.
