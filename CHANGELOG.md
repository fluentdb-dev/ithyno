# Changelog

All notable changes to ithyno are documented here.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.1-alpha.4] - 2026-08-27

### Fixed

- Pinned the staged `esbuild` JavaScript runtime and every bundled platform
  binary to one exact version, preventing the VS Code extension server from
  failing with a host/binary version mismatch.
- Added prepack validation that stops VSIX creation when an esbuild package is
  missing or has drifted from the authoritative lockfile-backed version.

## [0.8.1-alpha.3] - 2026-08-27

### Changed

- Dashboard focus and visibility recovery now refresh only disconnected
  sessions, preserving active routes, open dialogs, and unsaved form input
  during ordinary window switching.

### Fixed

- Added a VS Code Extension Host clipboard bridge so model names and other
  values can be pasted into dashboard dialog fields inside the packaged VSIX.
- Preserved executable permissions for bundled macOS and Linux esbuild
  binaries when the cross-platform VSIX is produced on Ubuntu, preventing
  runtime `EACCES` failures after installation.

## [0.8.1-alpha.2] - 2026-08-22

### Added

- Added native same-CLI Codex worker delegation through Codex collaboration
  tools, including configured model forwarding and completion waiting.

### Changed

- Codex and Antigravity compatibility files are now generated from the
  packaged Claude-authoritative Skill sources instead of project-local output.
- Updated the README project overview, onboarding links, roadmap status, and
  Manager-to-Worker compatibility matrix.

### Fixed

- Preserved AgentRunner fallback for cross-CLI and process-only worker
  configurations while preferring native Codex delegation when compatible.
- Prevented stale project-local Claude commands from overwriting freshly
  rendered Codex prompts during Skill installation.
- Included the canonical dispatch sources in npm, Electron, and VS Code
  extension packaging inputs.

## [0.8.1-alpha.1] - 2026-08-14

### Fixed

- Fixed tmux-backed Manager PTY startup on Windows by using a
  PowerShell-native command path, with regression coverage for quoting and
  environment propagation.

## [0.8.1-alpha.0] - 2026-08-14

### Changed

- Electron now creates and displays its window while the dashboard server is
  starting, reducing the blank startup delay, especially on Windows.
- Electron startup reports progress and failure states in the window instead
  of waiting for server readiness before showing the UI.

### Fixed

- Corrected packaged Electron resource resolution so production builds locate
  the bundled server and assets reliably.
- Prevented duplicate dashboard-server processes during Electron startup on
  Windows.
- Hardened the local Electron launch helper and workspace settings for paths
  containing platform-specific separators and characters.

## [0.8.0-alpha.0] - 2026-08-12

### Added

- Cross-CLI agent dispatch for Claude, Codex, Copilot, and Antigravity,
  including isolated worktrees, staged code/review/verify execution, and
  parallel multi-change dispatch.
- Per-agent OpenSpec and ithyno Skill inspection and installation from the
  dashboard, with generated command, prompt, workflow, and Skill layouts for
  each supported client.
- Stable Electron dashboard session endpoints and propagation of the active
  ithyno port and session token into Manager PTY and tmux environments.
- Kanban improvements including phase-lane views, filtering, and one-click
  change-ID copying.
- GitHub Actions security controls: immutable Action SHA pins, least-privilege
  workflow permissions, Dependabot, Dependency Review, CodeQL, and OpenSSF
  Scorecard workflows.

### Changed

- Project initialization now scaffolds agent configuration and client-specific
  OpenSpec/ithyno entrypoints for the selected Manager environment.
- Dispatch routing now selects native same-CLI delegation only where supported
  and uses the shared AgentRunner for cross-CLI subprocess execution.
- Review and verification require fresh, parseable `review.md` artifacts at the
  resolved execution root, preventing stale or stdout-only success signals.
- Release builds support macOS, Windows, and Linux artifacts across the
  configured architectures.

### Fixed

- Prevented stale dashboard ports and session tokens after Electron reload,
  focus recovery, and tmux attachment.
- Corrected Agy workflow discovery and Codex command/Skill aliases.
- Preserved parallelism between independent changes while keeping each
  change's `code → review → verify` stages sequential.
- Improved Windows worktree path handling, including symlink and 8.3 short-name
  normalization.
- Resolved vulnerable transitive `js-yaml` versions by pinning compatible
  patched releases for both the 3.x and 4.x dependency trees.

## [0.0.1-alpha.0] - 2026-07-20

### Added

- **Version alignment**: all four owned `package.json` files (`package.json`,
  `electron/package.json`, `vscode-extension/package.json`,
  `vscode-extension/host/package.json`) pinned to `0.0.1-alpha.0` — a valid
  semver 2.0.0 string accepted by npm, vsce, and electron-builder.

- **Versioned artifact filenames**: the vscode-extension `package` script now
  emits `ithyno-<version>.vsix` (e.g. `ithyno-0.0.1-alpha.0.vsix`) instead of
  the fixed `ithyno.vsix`, so multiple releases coexist on disk. Electron
  artifacts embed version and arch via `electron-builder`'s `artifactName`
  template (e.g. `ithyno-0.0.1-alpha.0-arm64.dmg`).

- **`release:build` script**: `npm run release:build` runs `typecheck` → `test`
  → `build` → vscode-extension package → electron package (host platform), in
  order, failing fast on any step. Prints a summary of produced artifacts with
  sizes at the end.

- **`release:version` script**: `npm run release:version -- <new-version>`
  validates the argument with `semver.valid()` and writes it atomically to all
  four owned manifests. Rejects non-semver input with a non-zero exit and no
  file modifications.

- **CI workflow**: `.github/workflows/release.yml` runs `release:build` on
  macOS, Windows, and Linux in parallel, uploads artifacts via
  `actions/upload-artifact@v4`, and references no repository secrets.

- **Release documentation**: `docs/release.md` describes the manual maintainer
  sequence (bump → changelog → build → smoke-test → tag).
