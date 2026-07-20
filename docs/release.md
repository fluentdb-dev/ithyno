# Release process

This document describes the manual steps a maintainer runs to cut a new
ithyno release. The workflow is deliberately narrow: local reproducible builds
and a git tag. Signing, notarization, marketplace publication, and GitHub
Release automation are **out of scope** for this workflow — see
[Out of scope](#out-of-scope) below.

## Maintainer sequence

1. **Bump the version** across all four owned `package.json` files:

   ```sh
   npm run release:version -- <next-version>
   # Example: npm run release:version -- 0.0.2-alpha.0
   ```

   The script validates the argument with `semver.valid()` and exits non-zero
   if the value is not valid semver 2.0.0. No files are modified on failure.

2. **Update `CHANGELOG.md`**: add a `## [<next-version>] - YYYY-MM-DD`
   section summarising the changes in this release.

3. **Run the release build**:

   ```sh
   npm run release:build
   ```

   This runs, in order:
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
   - `npm run --workspace ithyno-vscode package`  → `vscode-extension/ithyno-<version>.vsix`
   - `npm run --workspace ithyno-electron package:<platform>`  → `electron/dist/ithyno-<version>-<arch>.<ext>`

   Fails fast if any step exits non-zero. Prints a summary of produced
   artifacts (path + size) at the end.

4. **Smoke-test each produced artifact**:
   - Install and launch the Electron app from its installer (DMG/NSIS/AppImage).
   - Install the VSIX in VS Code (`Extensions: Install from VSIX…`) and open
     the dashboard.
   - Confirm the displayed version matches the release.

5. **Create a git tag**:

   ```sh
   git tag v<version>
   git push origin v<version>
   ```

## Out of scope

The following are **not** handled by this workflow and are tracked as
follow-ups:

| Topic | Notes |
|---|---|
| Code signing (macOS / Windows) | Requires Apple Developer / EV certificates and secure secret storage. |
| Notarization (macOS) | Requires an Apple ID with notarization entitlements and Xcode tools. |
| VS Code Marketplace publish | Requires a `VSCE_PAT` personal access token from the publisher account. |
| npm registry publish | Requires an npm access token and a decision on the package scope. |
| GitHub Release automation | Requires `gh release create` wiring and a `GITHUB_TOKEN` with `contents: write`. |
| Auto-update wiring | Requires a signed update manifest and a distribution server (e.g. S3, GitHub Releases). |

When these follow-ups are implemented, update this document to reflect the new
steps and move the corresponding items out of the "Out of scope" table.
