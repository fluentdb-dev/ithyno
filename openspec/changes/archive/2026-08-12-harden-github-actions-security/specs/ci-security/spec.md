## ADDED Requirements

### Requirement: Least-Privilege Workflow Credentials

Every GitHub Actions workflow SHALL declare explicit `GITHUB_TOKEN`
permissions, defaulting to read-only repository contents or no permissions.
Write access MUST be scoped to the individual job that requires it and MUST NOT
be available while executing pull-request code.

#### Scenario: Test workflow executes a pull request
- **WHEN** the test workflow runs for a pull request
- **THEN** its token has no repository write permission

#### Scenario: Release assets are published
- **WHEN** the release publish job runs for a version tag
- **THEN** only that job receives `contents: write`

### Requirement: Immutable Action References

Every GitHub Actions `uses:` reference SHALL be pinned to a full commit SHA and
SHALL identify the intended upstream release version in adjacent source text.

#### Scenario: Workflow dependency is reviewed
- **WHEN** a reviewer inspects any `uses:` entry
- **THEN** the executable revision is an immutable 40-character commit SHA
- **AND** the corresponding release version remains human-readable

### Requirement: Automated Dependency Security Review

The repository SHALL inspect pull-request dependency changes and fail the
security check when a newly introduced dependency has a known vulnerability at
the configured severity threshold or above.

#### Scenario: Vulnerable package enters the lockfile
- **WHEN** a pull request introduces a dependency with a known moderate-or-higher vulnerability
- **THEN** Dependency Review fails with an actionable finding

### Requirement: Automated Code Security Analysis

The repository SHALL analyze its JavaScript and TypeScript code with CodeQL on
pull requests, protected development/release branch pushes, and a recurring
schedule, subject to the repository's GitHub security-feature availability.

#### Scenario: Pull request changes TypeScript code
- **WHEN** CodeQL is available and a pull request changes repository code
- **THEN** the CodeQL workflow analyzes the JavaScript/TypeScript codebase
- **AND** publishes findings to GitHub code scanning without exposing secrets

### Requirement: Supply-Chain Posture Monitoring

The repository SHALL run OpenSSF Scorecard on a recurring schedule with only
the permissions required to inspect repository metadata and publish its
security result.

#### Scenario: Scheduled posture scan runs
- **WHEN** the scheduled Scorecard workflow starts
- **THEN** it evaluates the pinned-dependency and repository-hardening posture
- **AND** uploads a result consumable by GitHub code scanning

### Requirement: Automated Security Dependency Maintenance

Dependabot SHALL monitor npm packages and GitHub Actions dependencies on a
recurring schedule, keeping workflow trust updates distinct from application
dependency updates.

#### Scenario: A pinned Action receives a security update
- **WHEN** an upstream Action release resolves to a newer approved commit
- **THEN** Dependabot can open a pull request updating the pinned SHA
