## MODIFIED Requirements

### Requirement: `release:build` orchestrator

The repository SHALL expose a single root npm script `release:build` that produces all release artifacts locally in a deterministic order, and SHALL verify the produced bundles' shape and scaffold reachability before the artifact summary prints.

#### Scenario: End-to-end local release build

- **GIVEN** a clean checkout with the current version pinned in all owned `package.json` files
- **WHEN** a maintainer runs `npm run release:build`
- **THEN** the script executes `npm run typecheck`, `npm test`, `npm run build`, the vscode-extension package script, and the electron package script, in that order
- **AND** the script fails fast if any step exits non-zero
- **AND** on success the script prints a summary listing each produced artifact path with its size

#### Scenario: Scope of the orchestrator

- **WHEN** a maintainer runs `npm run release:build`
- **THEN** the script does NOT sign artifacts, does NOT notarize, does NOT publish to any marketplace or registry, and does NOT create git tags or GitHub releases
- **AND** those actions remain manual follow-ups documented in `docs/release.md`

#### Scenario: Bundle verification runs before the artifact summary

- **GIVEN** a `release:build` invocation that has completed `typecheck`, `test`, `build`, vscode-extension `package`, and electron `package` steps successfully
- **WHEN** the orchestrator continues past the electron package step
- **THEN** it executes `node scripts/verify-bundle.mjs` before invoking `scripts/release-summary.mjs`
- **AND** if `verify-bundle.mjs` exits non-zero the orchestrator fails fast with that exit code, matching the fail-fast contract applied to every earlier step
- **AND** on verification success the orchestrator proceeds to the artifact summary as before

#### Scenario: Bundle verification asserts npm tarball shape

- **GIVEN** the `verify-bundle.mjs` script is invoked from `release:build` (or directly via `npm run release:verify-bundle`)
- **WHEN** the script runs `npm pack --pack-destination <tmpdir>` on the repo root, extracts the resulting `.tgz`, and walks the extracted `package/` tree
- **THEN** every path containing `ithy-opsx` MUST live under `package/templates/.claude/…`
- **AND** no path MUST match `^package/\.claude/commands/ithy-opsx` or `^package/\.claude/skills/ithy-opsx-`
- **AND** on either invariant violation the script exits non-zero with a message naming the offending path AND naming `distribute-ithy-opsx-via-init-templates` as the contract being violated

#### Scenario: Bundle verification asserts Electron bundle shape for each produced OS bundle

- **GIVEN** the `verify-bundle.mjs` script inspects `electron/dist/` for produced bundles
- **WHEN** it finds a Mac bundle at `electron/dist/mac*/ithyno.app/Contents/Resources/app/` or a Windows unpacked bundle at `electron/dist/win-unpacked/resources/app/`
- **THEN** for each such bundle it MUST assert every path containing `ithy-opsx` lives under `<app>/templates/.claude/…`
- **AND** MUST assert `<app>/.claude/commands/ithy-opsx/` and `<app>/.claude/skills/ithy-opsx-*/` do NOT exist
- **AND** MUST skip (with a logged notice, not a failure) any OS bundle not present in `electron/dist/`, so the host-only `release:build` path (which produces only the host OS bundle) still verifies the bundle it did produce without failing on the absent bundles
- **AND** Linux AppImage bundle contents SHALL be skipped in this change (documented in `design.md` D3 and reserved for a future extension)

#### Scenario: Bundle verification runs init from the packaged bin

- **GIVEN** at least one Electron bundle is present under `electron/dist/`
- **WHEN** `verify-bundle.mjs` selects one bundle (prefer Mac arm64 if present, else Mac x64, else Windows unpacked) and shells out to that bundle's `<app>/bin/ithyno init <mkdtemp target>`
- **THEN** the bundled bin MUST exit zero
- **AND** the target MUST contain every file under the source repo's `.claude/commands/ithy-opsx/` at `<target>/.claude/commands/ithy-opsx/…`, byte-identical
- **AND** the target MUST contain every file under each source `.claude/skills/ithy-opsx-*/` at `<target>/.claude/skills/<skill>/…`, byte-identical
- **AND** on any mismatch the script exits non-zero with a message identifying the missing or diverging path, so a reader can grep `bin/init.js` or the bundle's `extraResources` config in one step

#### Scenario: `release:verify-bundle` invokes verification independently

- **GIVEN** an existing `electron/dist/` populated by a prior `release:build`
- **WHEN** a maintainer runs `npm run release:verify-bundle`
- **THEN** the script executes `node scripts/verify-bundle.mjs` and applies the same assertions as the `release:build`-integrated path
- **AND** the script does NOT re-run typecheck, test, build, vscode-extension package, or electron package (its purpose is to iterate on verification without paying the full release chain's cost)

#### Scenario: Bundle verification failure surfaces a specific, actionable message

- **GIVEN** a hypothetical regression that reintroduces `.claude/commands/ithy-opsx` to root `package.json` `files` OR to `electron/package.json` `extraResources`
- **WHEN** `release:build` runs and reaches the `verify-bundle` step
- **THEN** the script exits non-zero with a message that (a) names the specific path that violated the invariant, (b) identifies the artifact (tarball, mac bundle, or win bundle), and (c) references `distribute-ithy-opsx-via-init-templates` as the contract being violated
- **AND** the release build stops before the artifact summary prints, ensuring no unverified bundle is announced as ready
