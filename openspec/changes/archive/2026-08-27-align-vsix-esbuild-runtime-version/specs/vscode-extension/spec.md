## ADDED Requirements

### Requirement: VSIX Esbuild Runtime Version Alignment

The VS Code extension packaging flow SHALL stage the JavaScript `esbuild` package and every bundled platform-specific `@esbuild/*` binary package at one identical, exact version. The packaging flow MUST stop before creating the VSIX if the authoritative version cannot be resolved, a required package is missing, or any staged package version differs.

#### Scenario: Fresh Ubuntu release packaging

- **GIVEN** release dependencies were installed from the repository lockfile
- **WHEN** the Ubuntu runner stages the cross-platform VSIX dependencies
- **THEN** `node_modules/esbuild` and every explicitly bundled `node_modules/@esbuild/*` package use the same exact version
- **AND** the resulting VSIX can start the esbuild service on each supported platform without a host/binary version mismatch

#### Scenario: Staged package version drifts

- **GIVEN** the staged JavaScript package or one platform binary reports a version different from the authoritative esbuild version
- **WHEN** prepack validates the staged runtime
- **THEN** prepack exits unsuccessfully before `vsce package` runs
- **AND** the error identifies the mismatched package and both versions

#### Scenario: Authoritative package is unavailable

- **GIVEN** the lockfile-backed root esbuild installation is missing or unreadable
- **WHEN** VSIX prepack begins
- **THEN** prepack exits unsuccessfully with an actionable dependency-installation error
- **AND** it does not substitute a hard-coded fallback version
