## 1. Version Source and Dependency Staging

- [x] 1.1 Remove the hard-coded esbuild fallback and require the lockfile-backed root esbuild installation as the authoritative version source.
- [x] 1.2 Generate the staged direct `esbuild` dependency and every supported `@esbuild/*` dependency from the same exact version and shared package list.

## 2. Prepack Validation

- [x] 2.1 Validate the installed staged JavaScript package and all required platform packages before VSIX creation, with actionable missing/mismatch errors.
- [x] 2.2 Preserve POSIX executable-mode normalization after version validation.

## 3. Regression Coverage and Packaging Verification

- [x] 3.1 Add unit coverage for exact dependency generation, aligned fixtures, missing packages, and version mismatches on all test platforms.
- [x] 3.2 Run focused tests, typecheck, and OpenSpec strict validation.
- [x] 3.3 Build a fresh VSIX and verify that its staged JavaScript and macOS/Linux platform packages have identical versions and executable modes.
