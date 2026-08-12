## Why

The repository's test and release workflows currently rely on GitHub's default
`GITHUB_TOKEN` permissions and reference reusable Actions through mutable major
version tags. The repository also lacks automated dependency review, static
security analysis, and scheduled workflow-security monitoring. A compromised
Action tag or an unnecessarily privileged job could therefore have more impact
than required, while vulnerable dependency changes may reach `develop` without
a dedicated security signal.

## What Changes

- Set explicit least-privilege permissions for every workflow and grant write
  access only to the tag-only release publishing job.
- Pin every third-party and GitHub-maintained Action to a full commit SHA while
  retaining its release version in an adjacent comment.
- Add Dependabot coverage for npm dependencies and GitHub Actions references.
- Add CodeQL analysis for the JavaScript/TypeScript codebase on pull requests,
  protected branch pushes, and a scheduled run.
- Add pull-request dependency review that rejects newly introduced vulnerable
  dependencies at a defined severity threshold.
- Add a scheduled OpenSSF Scorecard workflow with the narrow permissions needed
  to publish code-scanning results.
- Document repository settings that cannot be enforced by workflow files,
  including branch protection and GitHub security-feature availability.

## Capabilities

### New

- `ci-security`: Security controls and automated analysis for GitHub Actions and
  dependency changes.

## Impact

- `.github/workflows/test.yml` and `.github/workflows/release.yml`
- New security workflows under `.github/workflows/`
- New `.github/dependabot.yml`
- Security documentation for required repository-side configuration
- Pull requests may gain new required checks; CodeQL, dependency review, and
  Scorecard availability depends on repository visibility and enabled GitHub
  security features
