## Context

The VSIX stages production dependencies in a fresh directory without the repository lockfile. The prepack script currently reads `0.28.1` from the root installation and adds exact `@esbuild/*` platform packages, but leaves the JavaScript `esbuild` package transitive. On the Ubuntu release runner npm resolved that package to `0.28.2`, producing a VSIX whose host protocol and native binary protocol are incompatible.

## Goals / Non-Goals

**Goals:**

- Use one authoritative esbuild version for the staged JavaScript package and all supported platform binaries.
- Fail packaging before VSIX creation if any staged esbuild component is missing or mismatched.
- Keep the existing cross-platform VSIX and executable-mode normalization.

**Non-Goals:**

- Replace runtime TypeScript execution or remove esbuild from the packaged server.
- Change Electron dependency staging.
- Modify an already published release asset in place.

## Decisions

### 1. Pin the JavaScript package as a direct staged dependency

The prepack script will add `esbuild` itself at the same exact version as every `@esbuild/*` package. The authoritative version comes from the root `node_modules/esbuild/package.json`, which is installed from the repository lockfile before release packaging. A missing or invalid source package is an error; there is no hard-coded fallback.

This is preferred over allowing a second un-locked install to resolve a newer transitive package, and is simpler than maintaining a separate generated lockfile for the staging directory.

### 2. Validate the installed runtime before packaging

After staging dependencies, a helper will read the JavaScript package and every explicitly bundled platform package. All must equal the expected version. A missing package or mismatch aborts prepack with the affected package name and versions.

The version-alignment check runs before executable-mode normalization and before `vsce package`, so an invalid VSIX cannot be produced successfully.

### 3. Test dependency generation and installed-package validation separately

Unit tests will prove that dependency generation includes the exact `esbuild` package plus every supported binary package, accepts an aligned fixture, and rejects a mismatched fixture. Existing tests continue to cover POSIX execute-bit normalization.

## Risks / Trade-offs

- **The root installation is missing or stale.** → Fail prepack and require the normal `npm ci`/`npm install` preparation instead of guessing a version.
- **A new platform package is added without validation.** → Generate both staged dependencies and validation input from one exported package list.
- **npm creates an additional nested esbuild copy.** → Runtime resolution uses the direct staged package; validation covers the direct package and all explicitly shipped top-level platform packages.

## Migration Plan

Publish the correction as a new prerelease version. Users of `0.8.1-alpha.3` must install the new VSIX; the existing release remains unchanged for artifact immutability and traceability.

## Open Questions

None.
