## ✅ What worked

- Full-SHA Action pinning, read-only default workflow permissions, CodeQL, and
  the three-platform Test workflow all passed on `develop` after push.
- GitHub repository settings now enable vulnerability alerts, Dependabot
  security updates, Secret Scanning, Push Protection, and read-only default
  workflow permissions.
- Branch protection requires pull requests, one approval, resolved
  conversations, and blocks force pushes and deletion while retaining an admin
  escape hatch.

## ⚠️ What surprised us

- Enabling vulnerability alerts immediately surfaced 107 existing default-
  branch findings: 41 high, 54 moderate, and 12 low. They require a separate
  dependency-remediation effort rather than an automatic breaking upgrade.
- GitHub cannot manually dispatch a newly added workflow until that workflow
  exists on the default branch. Since `main` is 50 commits behind `develop`,
  the Scorecard workflow cannot be manually exercised yet.
- Requiring a check whose workflow does not exist on the protected base branch
  can leave pull requests waiting forever. Therefore `develop` requires CodeQL,
  Dependency Review, and the three Test jobs, while `main` temporarily requires
  only the three Test jobs.

## 🔁 What we'd do differently

- Land security workflows on the default branch before configuring their names
  as required checks there.
- Use a project-local npm cache during local validation because the developer's
  global npm cache contains root-owned entries unrelated to this change.

## 🌱 Follow-ups

- After the next normal `develop` to `main` release merge, run Scorecard and
  add CodeQL plus Dependency Review to `main`'s required checks.
- Triage the 107 Dependabot findings by direct versus transitive dependency,
  exploitability, and breaking-change risk.
- Consider artifact attestations and signed release artifacts as a separate
  release-hardening change.
