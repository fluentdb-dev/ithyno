# Tasks — pty-startup-default-fresh-session

## 1. PENDING annotation

- [x] 1.1 Insert PENDING MODIFIED annotation into
  `openspec/specs/dashboard/spec.md` §
  `Embedded PTY Uses tmux When Agmsg Is Configured`

## 2. Spec delta

- [x] 2.1 MODIFIED `Embedded PTY Uses tmux When Agmsg Is Configured`
  — update the resolved-startup scenario text (`claude --continue`
  → `claude` for the fallback case; `--continue` example only
  applies when the manager entry supplies it)
- [x] 2.2 Add a scenario: "no manager, no env → fallback is
  `claude`"

## 3. Code

- [x] 3.1 `server/sync/pty.ts`: change fallback string from
  `claude --continue` to `claude`
- [x] 3.2 Update the doc comment block above the fallback so the
  priority-list description matches

## 4. Tests

- [x] 4.1 Add / update a unit test asserting the fallback string is
  `claude` when neither manager nor env is provided

## 5. Template

- [x] 5.1 `templates/agents.yaml.example`: insert the commented
  manager sample block (three variants: --continue, --resume, plain
  `claude`) before the existing worker agent example
- [x] 5.2 Verify the template drift guard still passes
  (server/init.test.ts template drift check compares body, not
  frontmatter; adding to `agents.yaml.example` doesn't affect the
  skill file, so no change to the drift guard's exclusion list)

## 6. Docs

- [x] 6.1 `docs/migration-guide.md`: add one line noting the default
  fresh-session behavior + pointer to the template sample

## 7. Verify

- [x] 7.1 `openspec validate pty-startup-default-fresh-session --strict`
- [x] 7.2 `npm test && npm run typecheck && npm run build` clean
- [x] 7.3 Manual: launch a fresh dir via File → New Project…, land
  in the new project's Kanban, observe the embedded Terminal opens
  a `claude` session (no "No conversation found" message)
- [x] 7.4 Manual: on the openspec-ui project (which has no manager
  entry currently under my agents.yaml single-prompt-mode edit),
  reload the terminal and observe the same fresh-session behavior

## 8. Post-impl

- [x] 8.1 `outcome.md`
- [ ] 8.2 `/ithy-opsx:archive pty-startup-default-fresh-session`
