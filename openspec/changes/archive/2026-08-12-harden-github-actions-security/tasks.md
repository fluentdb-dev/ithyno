## 1. Existing Workflow Hardening

- [x] 1.1 Add explicit least-privilege permissions to test and release workflows.
- [x] 1.2 Resolve each existing Action release to its verified full commit SHA and annotate the intended version.
- [x] 1.3 Add a regression check that rejects mutable or unannotated `uses:` references and unexpected write permissions.

## 2. Dependency Security

- [x] 2.1 Add `.github/dependabot.yml` for weekly npm and GitHub Actions updates with separate grouping.
- [x] 2.2 Add a pull-request Dependency Review workflow pinned to a full commit SHA and configured for moderate-or-higher findings.

## 3. Static and Supply-Chain Analysis

- [x] 3.1 Add a CodeQL workflow for JavaScript/TypeScript pull requests, `develop`/`main` pushes, and a weekly schedule.
- [x] 3.2 Add an OpenSSF Scorecard workflow with minimal permissions, immutable Action references, and SARIF upload.
- [x] 3.3 Guard event-specific upload steps so fork pull requests do not receive or require privileged credentials.

## 4. Documentation and Verification

- [x] 4.1 Document GitHub-side prerequisites, recommended branch protection, and feature-availability limitations.
- [x] 4.2 Validate workflow YAML and run the workflow security regression tests.
- [x] 4.3 Run `npm run typecheck && npm test && npm run build`.
- [x] 4.4 Run `npm run openspec -- validate harden-github-actions-security --strict` and validate affected specifications.
- [x] 4.5 Observe the new checks on a pushed branch before making them required, then write `outcome.md`.
