# app-icon Specification

## Purpose
TBD - created by archiving change add-app-icon-branding. Update Purpose after archive.
## Requirements
### Requirement: Single-source icon at repo root

The repository SHALL keep `icon.png` at its root as the canonical source of the app icon. Every published surface's icon (favicon, Electron app icon, VS Code Marketplace icon) SHALL be derived from this file.

#### Scenario: Source file exists at repo root

- **WHEN** a reader opens the repository at its root
- **THEN** `icon.png` exists as an RGBA PNG at least 1024×1024 (source is 1268×1280)

#### Scenario: All surface icons derive from the source

- **GIVEN** the source is edited (e.g., color tint, new mark)
- **WHEN** `npm run build:icons` is invoked
- **THEN** every generated target file is regenerated from the new source
- **AND** no target retains bits of the previous source

### Requirement: Icon generation pipeline

The system SHALL provide a Node script `scripts/build-icons.mjs` that emits all per-surface icons from the single source. The script SHALL be idempotent and deterministic.

#### Scenario: Script emits all seven targets

- **WHEN** `npm run build:icons` runs on a clean checkout
- **THEN** the following files exist and are non-empty:
  - `web/public/favicon.png` (32×32 PNG)
  - `web/public/favicon.ico` (multi-size ICO)
  - `web/public/apple-touch-icon.png` (180×180 PNG)
  - `electron/build/icon.icns` (multi-resolution ICNS)
  - `electron/build/icon.ico` (multi-size ICO)
  - `electron/build/icon.png` (512×512 PNG)
  - `vscode-extension/icon.png` (128×128 PNG)

#### Scenario: Second run is byte-identical

- **GIVEN** a first `npm run build:icons` has completed
- **WHEN** the script is run a second time without editing the source
- **THEN** every target file is bit-identical to its first-run output

#### Scenario: Non-square source is padded, not stretched

- **GIVEN** the source is 1268×1280 (aspect ~0.99, not exactly square)
- **WHEN** the script processes it
- **THEN** the icon is centered on a 1024×1024 canvas with transparent padding (`fit: contain`)
- **AND** no visible aspect-ratio distortion appears in any target

### Requirement: Web favicon wiring

The web dashboard SHALL declare the generated favicon files in `web/index.html` so browsers pick them up at first paint.

#### Scenario: Index HTML includes favicon links

- **WHEN** a reader opens `web/index.html`
- **THEN** the `<head>` contains three link tags: `<link rel="icon" type="image/png" href="/favicon.png">`, `<link rel="icon" type="image/x-icon" href="/favicon.ico">`, `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`

#### Scenario: Browser tab shows the icon

- **GIVEN** the dashboard is served from the ithyno server
- **WHEN** a user opens `http://localhost:<port>/` in any modern browser
- **THEN** the browser tab shows the ithyno icon (not the default globe / world icon)

### Requirement: Electron app icon wiring

The Electron package configuration SHALL reference the platform-appropriate icon files so `electron-builder` embeds them in every produced installer.

#### Scenario: Electron builder config declares icons

- **WHEN** a reader opens `electron/package.json`
- **THEN** `build.mac.icon` is `"build/icon.icns"`, `build.win.icon` is `"build/icon.ico"`, and `build.linux.icon` is `"build/icon.png"`

#### Scenario: macOS packaged app shows icon

- **GIVEN** the app has been packaged with `npm --workspace ithyno-electron run package:mac`
- **WHEN** the built `.app` is opened in Finder
- **THEN** its icon is the ithyno icon (not the default Electron atom)
- **AND** the icon appears in the macOS Dock, `Cmd+Tab` switcher, and the About panel

#### Scenario: Windows packaged app shows icon

- **GIVEN** the app has been packaged with `npm --workspace ithyno-electron run package:win`
- **WHEN** the produced NSIS installer runs
- **THEN** the installer's window icon and the shortcut icon it creates are the ithyno icon

### Requirement: VS Code extension icon wiring

The VS Code extension manifest SHALL declare the `icon` field so `vsce package` bundles the icon into the vsix and the Marketplace listing displays it.

#### Scenario: Extension manifest declares icon

- **WHEN** a reader opens `vscode-extension/package.json`
- **THEN** the top-level `"icon": "icon.png"` field is present

#### Scenario: VSIX contains the icon

- **GIVEN** the extension has been packaged with `npm --workspace ithyno-vscode run package`
- **WHEN** the produced `.vsix` archive is inspected
- **THEN** it contains `extension/icon.png` and its `extension/package.json` retains the `icon` field

#### Scenario: VS Code Extensions panel shows icon

- **GIVEN** the produced `.vsix` has been installed in a VS Code instance
- **WHEN** the user opens the Extensions panel
- **THEN** the ithyno extension entry displays the ithyno icon next to its name

