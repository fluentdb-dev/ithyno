## Context

The repository runs untrusted repository content through npm scripts on three
hosted runner operating systems and produces downloadable Electron and VS Code
artifacts. Its current workflows use mutable Action tags such as
`actions/checkout@v4`, omit workflow-level permissions, and have no dedicated
security-analysis workflow. The publish job already narrows its permissions to
`contents: write`, which provides a useful baseline to preserve.

GitHub security capabilities have different availability constraints. CodeQL
and dependency review are generally available for public repositories and may
require GitHub Code Security for private repositories. Workflow files must not
pretend to enable repository settings that require an administrator action.

## Goals / Non-Goals

**Goals:**

- Minimize the authority available to build and test jobs.
- Make Action source revisions immutable and maintainable.
- Detect vulnerable dependency changes and JavaScript/TypeScript security
  defects before merge.
- Monitor the repository's broader supply-chain posture on a schedule.
- Keep tag-based release publishing functional with narrowly scoped write
  access.

**Non-Goals:**

- Automatically fixing findings or merging dependency updates.
- Uploading project secrets to third-party scanners.
- Replacing npm audit or application-specific security tests.
- Enabling organization/repository settings through the GitHub API.
- Adding signing, notarization, or artifact provenance in this change.

## Decisions

### D1: Deny token permissions by default

Every workflow will declare top-level `permissions: contents: read`. Jobs that
need less may use `permissions: {}`. Only the tag-gated release publishing job
will retain `contents: write`. Security upload jobs will declare only their
documented `security-events` and identity permissions.

This makes authorization visible in review and prevents a future workflow step
from silently inheriting broader repository defaults.

### D2: Pin Actions to full commit SHAs

Every `uses:` reference will use a 40-character commit SHA. A comment will name
the corresponding release tag, for example `# v4.x.y`, so Dependabot and human
reviewers can understand updates. This applies to GitHub-maintained Actions as
well as third-party Actions because tags in either namespace are mutable Git
references.

Dependabot will monitor the `github-actions` ecosystem weekly and propose SHA
updates. npm dependencies will be handled in a separate weekly group to keep
workflow trust changes reviewable independently from application packages.

### D3: Separate PR gates from scheduled posture checks

Dependency Review will run only for pull requests and fail when a newly added
dependency has a known vulnerability at `moderate` severity or above. CodeQL
will run for pull requests, pushes to `develop` and `main`, and weekly. It will
analyze JavaScript/TypeScript using the standard build mode unless repository
behavior demonstrates that a manual build is required.

OpenSSF Scorecard will run weekly and on relevant branch pushes. Its SARIF
result will be uploaded to GitHub code scanning. It is a posture signal rather
than a per-change build gate, so transient Scorecard service failures do not
block ordinary test execution.

### D4: Keep fork pull requests non-privileged

Security workflows will use `pull_request`, not `pull_request_target`, for
untrusted changes. They will not expose repository secrets or execute a fork's
code with write permissions. Where GitHub does not issue `security-events:
write` to a fork pull request, SARIF upload will be skipped or use the event
conditions recommended by the Action owner; analysis itself remains useful.

### D5: Record repository-side prerequisites explicitly

A short security document will identify settings that require a repository
administrator: enabling code scanning/dependency graph as applicable, selecting
required status checks, requiring pull requests, and restricting workflow
approval. Workflow implementation will remain valid when an unavailable
GitHub security product is intentionally omitted; the limitation must be
visible rather than silently weakening the check.

## Risks / Trade-offs

- **Pinned Actions require maintenance.** Dependabot's GitHub Actions updater
  offsets this cost while preserving reviewable immutable revisions.
- **Security products may be unavailable on a private repository.** The
  implementation must confirm repository visibility before making a check
  required and document the feature gate.
- **Additional workflows consume runner minutes.** CodeQL and Scorecard are
  scheduled weekly, while Dependency Review remains PR-only.
- **New findings may initially be noisy.** Dependency Review starts at moderate
  severity; CodeQL uses default queries first rather than immediately enabling
  an extended experimental pack.
- **Release publication needs write access.** The permission remains isolated
  to the tag-only publish job and is not granted to matrix build jobs.

## Migration Plan

1. Pin existing workflow Actions and add explicit permissions without changing
   job behavior.
2. Add Dependabot, Dependency Review, CodeQL, and Scorecard workflows.
3. Validate workflow syntax and run the existing local test/build suite.
4. Push to a branch and observe each workflow before marking it required.
5. Enable the supported repository security features and branch checks through
   GitHub settings.

Rollback can remove the new security workflows while retaining SHA pinning and
least-privilege permissions, which are independently safe improvements.

## Open Questions

- The repository is public, so CodeQL and Dependency Review are available.
- Decide whether artifact attestations should be a follow-up release-hardening
  change after this baseline is stable.
