## ADDED Requirements

### Requirement: Per-commit CI matrix runs on macOS, Windows, and Linux

The repository SHALL provide a `.github/workflows/test.yml` GitHub
Actions workflow that runs the per-commit test signal (`npm test`,
`npm run typecheck`, `npm run build`, and `npm run openspec --
validate --all`) across a three-OS matrix — `macos-latest`,
`windows-latest`, and `ubuntu-latest` — on every pull request and on
every push to `develop` and `main`.

The workflow SHALL be distinct from `release.yml`. `release.yml`
governs release-artifact builds and remains scoped as-is;
`test.yml` governs the per-commit test-suite matrix. The two files
SHALL NOT share concurrency groups.

The matrix strategy SHALL set `fail-fast: false` so a failure on one
OS does not cancel the other OS jobs. Each job SHALL run under Node
20 (matching `release.yml`).

Every `run:` step in `test.yml` SHALL declare `shell: bash`
explicitly so Windows uses git-bash (bundled with the `windows-latest`
runner image) rather than PowerShell. Step scripts SHALL be
single-source across all three OSes with no shell-conditional
branches.

The repository SHALL declare a root-level `.gitattributes` with
`* text=auto eol=lf` (and appropriate `-text` exceptions for binary
patterns) so that files checked out on Windows retain LF line
endings, ensuring the byte-comparison template drift guard and the
`npm pack` package-shape assertion do not fail due to CRLF
conversion.

The workflow SHALL NOT reference any repository secrets and SHALL
NOT upload artifacts (`release.yml` handles artifact production).

#### Scenario: PR triggers three-OS matrix

- **GIVEN** a pull request against `develop` or `main`
- **WHEN** the `test.yml` workflow starts
- **THEN** three jobs execute in parallel on `macos-latest`,
  `windows-latest`, and `ubuntu-latest`
- **AND** each job runs `npm ci --include=optional`, then
  `npm run typecheck`, `npm test`, `npm run build`, and
  `npm run openspec -- validate --all`, in that order
- **AND** the matrix strategy has `fail-fast: false`, so a Windows
  failure does not cancel the macOS or Linux jobs
- **AND** the workflow does NOT upload artifacts

#### Scenario: Push to `develop` triggers three-OS matrix

- **GIVEN** a push directly to `develop` (post-merge or otherwise)
- **WHEN** the `test.yml` workflow starts
- **THEN** the same three-OS matrix runs as for a pull request

#### Scenario: Push to `main` triggers three-OS matrix

- **GIVEN** a push to `main` (release promotion from `develop`)
- **WHEN** the `test.yml` workflow starts
- **THEN** the same three-OS matrix runs as for a pull request
- **AND** `release.yml` runs in parallel on the same commit (their
  concurrency groups are distinct so neither cancels the other)

#### Scenario: Every step uses bash even on Windows

- **WHEN** a reviewer opens `test.yml`
- **THEN** every `run:` step either declares `shell: bash` or the
  job-level `defaults.run.shell` is set to `bash`
- **AND** no step invokes PowerShell-only syntax (e.g. `$env:Foo`,
  backtick line-continuation, `Get-ChildItem`)

#### Scenario: `.gitattributes` enforces LF line endings

- **WHEN** a reader opens the repository's `.gitattributes` file
- **THEN** the file contains `* text=auto eol=lf` (or an equivalent
  directive that yields LF checkouts on Windows for text files)
- **AND** the template drift guard test (`server/init.test.ts`)
  passes on the Windows runner without CRLF-related byte mismatches
- **AND** the `add-init-scaffold-smoke-test` npm-pack shape test
  passes on the Windows runner without CRLF-related byte mismatches

#### Scenario: Workflow references no secrets

- **WHEN** a reviewer inspects `test.yml`
- **THEN** the file does NOT reference `secrets.*` beyond the default
  `GITHUB_TOKEN` (and does not require write scope)
- **AND** the workflow runs unchanged for external-contributor PRs
  triggered via `pull_request` (no `pull_request_target` needed)

#### Scenario: Windows-specific regression fails CI

- **GIVEN** a hypothetical change that introduces `path.join(dir,
  "sub/leaf")` where the source assumes forward-slash separators
- **WHEN** the `test.yml` workflow runs
- **THEN** the `windows-latest` job's `npm test` step fails, naming
  the file whose path assertion diverged
- **AND** the `macos-latest` and `ubuntu-latest` jobs succeed,
  identifying the failure as Windows-specific
- **AND** the PR cannot merge until the regression is corrected
