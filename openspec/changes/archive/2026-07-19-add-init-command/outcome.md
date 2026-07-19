# Outcome — add-init-command

## ✅ Worked

- **`npx ithyno init .`** completes the fresh-project scaffold in one
  command. Idempotent, `--force` overwrites, `--no-gitignore` respects
  user preference, `--quiet` cuts chatter — all verified end-to-end.
- **Manual verify 8.1–8.5 pass** on a throwaway `/tmp/ithyno-init-*`
  git repo (fresh init, re-run no-force skip, --force overwrite,
  non-git-dir refusal, .gitignore idempotence).
- **Unit tests (10) cover** the internal building blocks — file-action
  policy, .gitignore append-only-if-missing, template drift guard.
  Vitest catches the drift; when `.claude/skills/openspec-flow/SKILL.md`
  changes and `templates/…/SKILL.md` isn't synced, the drift guard
  fails with a diff.
- **Drift guard was actually helpful** — first run of the test caught
  real drift (in-repo skill had a PENDING annotation section that
  templates was missing). Sync + test → green.
- **JS + `.d.ts` shim** keeps `bin/init.js` runnable via `npx` without a
  build step, while giving TS callers types.

## ⚠️ Surprises

- The old task text referred to `openspec-ui init` but the CLI is now
  `ithyno`. Rebranded in the tasks / docs to match reality — small
  drift from proposal time.
- Templates skill's frontmatter needs a genericized description
  (`for OpenSpec UI` / `for ithyno` is project-specific). The drift
  guard now compares bodies excluding lines starting with
  `description:` — one explicit exception, documented in the test.

## 🔁 Differently next time

- **Sync check as a pre-commit hook** would prevent the drift from ever
  landing in a commit. Currently the drift guard runs in tests only,
  which catches it in CI but not in local editors. A `husky` hook
  around `.claude/skills/openspec-flow/SKILL.md` edits could copy to
  templates automatically.
- Verify tasks 8.x were manual — a small integration test that spawns
  `bin/ithyno.js init` via `execFile` on a tmpdir would automate
  8.1–8.5 in the same test suite. Deferred as a follow-up.

## 🌱 Follow-ups

- **Auto-sync hook / CI check** for template drift beyond just tests.
- **`init --template <url>`** to fetch alternative template packs
  (e.g. a Python project's ithyno template) — not needed until a real
  request lands.
- **Interactive `init`** with prompts for project name / verification
  commands, replacing the placeholder in `CLAUDE.md`. Only worth it if
  the placeholder is noticeably ignored by new users.
