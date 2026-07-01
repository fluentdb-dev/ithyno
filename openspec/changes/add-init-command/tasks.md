## 1. Template files
- [x] 1.1 Create `templates/` at the package root
- [x] 1.2 Add `templates/CLAUDE.md` — generic version of the project rules (no openspec-ui-specific commands)
- [x] 1.3 Add `templates/.claude/skills/openspec-flow/SKILL.md` — verbatim copy of this repo's skill
- [x] 1.4 Add `templates/agents.yaml.example` — verbatim copy
- [x] 1.5 Add `templates/docs/.gitkeep` and `templates/docs/ideas/.gitkeep`
- [x] 1.6 Update `package.json` `files` to include `templates/`

## 2. CLI dispatch
- [x] 2.1 Refactor `bin/openspec-ui.js` to register subcommands via `commander`
- [x] 2.2 Default action (no subcommand) keeps the current server-start behavior
- [x] 2.3 Register `init [dir]` with `--force`, `--no-gitignore`, `--quiet` flags

## 3. init handler
- [x] 3.1 Create `bin/init.js` (or `server/init.ts` invoked via `tsx`)
- [x] 3.2 Preflight: check the target is a git repo via `git rev-parse --git-dir`
- [x] 3.3 Preflight: detect missing `openspec/config.yaml`, warn but proceed
- [x] 3.4 Walk `templates/` and copy each file to the target with skip-if-exists default
- [x] 3.5 Apply `--force` by overwriting existing files
- [x] 3.6 Ensure parent directories exist before write

## 4. .gitignore handling
- [x] 4.1 Read existing `.gitignore` if present
- [x] 4.2 Append `.worktrees/` only when the literal line is missing
- [x] 4.3 Create the file if absent
- [x] 4.4 Skip everything when `--no-gitignore` is passed

## 5. Reporting
- [x] 5.1 Log per-file actions (`create:`, `skip:`, `overwrite:`)
- [x] 5.2 Print a summary with created and skipped counts
- [x] 5.3 Print next-step commands (`openspec init` when missing, then `openspec-ui`)
- [x] 5.4 `--quiet` reduces output to errors only

## 6. Tests
- [ ] 6.1 Unit test for the file-action policy (create / skip / overwrite)
- [ ] 6.2 Unit test for `.gitignore` append-only-if-missing
- [ ] 6.3 Asserting `templates/.claude/skills/openspec-flow/SKILL.md` matches the in-repo skill (drift guard)

## 7. Docs
- [ ] 7.1 README: add the `openspec-ui init` line as the primary onboarding path
- [ ] 7.2 Update `docs/migration-guide.md` to feature `openspec-ui init` first, with manual steps as fallback

## 8. Verification
- [ ] 8.1 Running `openspec-ui init ./tmp-test-project` in a fresh git repo creates the expected files
- [ ] 8.2 Re-running without `--force` skips everything
- [ ] 8.3 Running with `--force` overwrites
- [ ] 8.4 Running against a non-git directory exits non-zero with the right message
- [ ] 8.5 `.gitignore` ends up with exactly one `.worktrees/` line regardless of how many times init runs
