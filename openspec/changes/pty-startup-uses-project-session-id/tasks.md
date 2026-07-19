# Tasks — pty-startup-uses-project-session-id

## 1. PENDING annotations

- [x] 1.1 `openspec/specs/dashboard/spec.md` § `Embedded PTY Uses
  tmux When Agmsg Is Configured` — PENDING MODIFIED
- [x] 1.2 `openspec/specs/project-init/spec.md` § `.gitignore
  Maintenance` — PENDING MODIFIED

## 2. Spec deltas

- [x] 2.1 Write MODIFIED `dashboard` § `Embedded PTY Uses tmux When
  Agmsg Is Configured` (expand priority-3 fallback + 2 new scenarios)
- [x] 2.2 Write MODIFIED `project-init` § `.gitignore Maintenance`
  (append-if-missing extended to `.ithyno/`)

## 3. Server implementation

- [x] 3.1 `server/sync/pty.ts` — extend the priority-3 fallback to
  read/mint `.ithyno/session-id` and pick `--session-id` vs
  `--resume` accordingly
- [x] 3.2 Update the doc comment block above the fallback to
  describe the new create-or-resume behavior
- [x] 3.3 Import path: `crypto` (`randomUUID`), `node:fs`, `node:path`

## 4. Server tests

- [x] 4.1 `server/sync/pty.test.ts`: the null-registry-no-env test
  now expects `claude --session-id <uuid>` on first call (file
  missing) — assert startup shape matches `claude --session-id <uuid-regex>`
- [x] 4.2 Add a test for the resume path: pre-write a UUID to a
  tmpdir, invoke `ptyStartup`, assert startup matches `claude
  --resume <that-uuid>`
- [x] 4.3 Add a test for the empty / whitespace file case (should
  mint fresh rather than emit a broken `--resume `)

## 5. init.js

- [x] 5.1 `bin/init.js` `updateGitignore` — extend to ensure both
  `.worktrees/` and `.ithyno/` appear; same append-only-if-missing
  logic for both
- [x] 5.2 Return value stays the same enum
  (`created`/`appended`/`already-present`/`skipped`) — reflects
  whether ANY line was added

## 6. init tests

- [x] 6.1 `server/init.test.ts`: extend `updateGitignore` tests to
  cover two-line case (fresh gitignore gets both lines; existing
  with `.worktrees/` only gets `.ithyno/` appended, vice versa;
  both present → `already-present`)
- [x] 6.2 Add: idempotent re-run test (both lines exist after any
  number of `updateGitignore` calls)

## 7. Docs

- [x] 7.1 `docs/migration-guide.md` — replace the `/resume`
  breadcrumb from `pty-startup-default-fresh-session` with a fuller
  paragraph about `.ithyno/session-id` (created on first Terminal
  open, gitignored, delete to reset)

## 8. Verify

- [x] 8.1 `openspec validate pty-startup-uses-project-session-id --strict`
- [x] 8.2 `npm test && npm run typecheck && npm run build` clean
- [ ] 8.3 Manual (Electron dev): open a fresh project via File →
  New Project → land in Kanban → observe: — **pending user smoke**
  - `.ithyno/session-id` exists with a UUID
  - `.gitignore` contains both `.worktrees/` and `.ithyno/`
  - Terminal shows a fresh Claude Code session (no error)
- [ ] 8.4 Manual: close the Terminal, reopen it → observe that
  Claude resumes the same session — **pending user smoke**
- [ ] 8.5 Manual: delete `.ithyno/session-id`, reopen Terminal →
  observe a NEW session is minted — **pending user smoke**

## 9. Post-impl

- [x] 9.1 `outcome.md`
- [ ] 9.2 `/ithy-opsx:archive pty-startup-uses-project-session-id`
