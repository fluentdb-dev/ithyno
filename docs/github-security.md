# GitHub security configuration

The repository keeps workflow security controls in versioned files, while a
small number of controls must be enabled in GitHub's repository settings.

## Included in the repository

- All GitHub Actions are pinned to immutable full commit SHAs. The adjacent
  version comments make updates reviewable; Dependabot proposes SHA updates.
- Test and build workflows receive read-only repository contents. Only the
  tag-gated release publishing job receives `contents: write`.
- Dependency Review rejects newly introduced dependencies with known
  moderate-or-higher vulnerabilities.
- CodeQL analyzes JavaScript and TypeScript changes and runs weekly.
- OpenSSF Scorecard reports supply-chain posture weekly and on `main` changes.
- npm and GitHub Actions dependencies receive separate weekly Dependabot PRs.

## Required GitHub settings

Repository administrators should review **Settings → Code security and
analysis** and enable the dependency graph, Dependabot alerts, and code
scanning. CodeQL and Dependency Review are available for public repositories;
private repositories may require GitHub Code Security. Do not mark those checks
as required until the repository plan exposes them and one branch run succeeds.

For `develop` and `main`, configure a ruleset or branch protection to:

- require a pull request and at least one approval;
- dismiss stale approvals when code changes;
- require the Test matrix, Dependency Review, and CodeQL checks after they have
  each completed successfully at least once;
- require conversations to be resolved;
- block force pushes and branch deletion;
- restrict workflow approval and write access to trusted maintainers.

Keep the repository's default workflow token permission read-only under
**Settings → Actions → General → Workflow permissions**. The release workflow's
job-level `contents: write` declaration remains the only publishing exception.

## Fork pull requests

Security checks use `pull_request`, never `pull_request_target`, so fork code is
not executed with a privileged token. No workflow in this baseline consumes a
repository secret. GitHub may restrict SARIF uploads for fork pull requests;
the branch run remains the authoritative code-scanning upload in that case.
