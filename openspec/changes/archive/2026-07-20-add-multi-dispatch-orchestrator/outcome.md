# Outcome — add-multi-dispatch-orchestrator

## ✅ Worked

- **Task-tool parallel branch works out of the box**. Claude Code's
  Task tool accepts N tool_use blocks in a single assistant message
  and runs them concurrently. `/ithy-opsx:dispatch-multi <ids>` uses
  this when `command == "claude"` and agmsg is absent — same
  concurrency semantics as agmsg spawn, no extra infra. Dogfooded
  today with `add-kanban-search-filter` + `add-light-dark-mode`
  landing in parallel worktrees.
- **`maxParallel` config integrates cleanly**. Added as a top-level
  optional field in `agents.yaml` (default `3`, range `[1, 10]`),
  parsed by registry + exposed via `publicConfig()`, mirrored on
  `AgentConfigResponse`. 6 new registry tests (283 → 289 green).
- **Report contract extension `change:<id>` is backward-compatible**.
  Old workers emit legacy `stage:$S status:done`; the Manager parser
  falls back to matching by sender `entry.name` (unambiguous when
  only one in-flight change uses that entry). New multi workers
  append `change:<id>` for disambiguation. Both shapes coexist.
- **Documentation caught the sequential-fallback lie**. My initial
  skill draft said "if agmsg is absent, degrade to sequential" —
  wrong. Fixed in follow-up commit `c5fb53c` to correctly describe
  the Task-tool parallel branch.

## ⚠️ Surprises

- **Manager (this Claude session) IS the dispatcher, and it BLOCKS
  across stages of a single `/ithy-opsx:dispatch`**. The single-
  dispatch skill's per-stage poll loop (5s inbox poll, up to 15
  min for code) means you can't run two dispatches back-to-back
  in one Manager without extending the flow. That's why
  `dispatch-multi` is a separate skill: it holds N in-flight
  entries in one combined poll loop, not N sequential dispatches.
- **`parallelExecution: true` was necessary but not sufficient**.
  It gave worktree isolation but the orchestration layer (multi-
  change poll loop, message routing, cap) was independent work.
- **Vite proxy hardcoded `localhost:4321`** meant even if each
  worktree ran its own `npm run dev`, the UI's Vite dev proxy
  collided on the shared API port. Worked around by running only
  Vite (not API) in the worktree and proxying to main's API.

## 🔁 Differently next time

- **Skip the archive-multi chase**. Initially considered
  `/ithy-opsx:archive-multi <ids>` to pair with dispatch-multi.
  User pushback (correctly): overkill. Doc-note "run archive per
  change" is enough. Skill now includes that guidance.
- **Test the CLI skill invocation flow** (not just the Task-tool
  branch). Today's dogfood exercised the Task-tool branch by hand
  — the `/ithy-opsx:dispatch-multi <ids>` slash-command invocation
  wasn't fired. Deferred to when agmsg is wired.

## 🌱 Follow-ups

- **agmsg-branch smoke** — `agents.yaml` needs an `agmsg:` block +
  code agent's `mode: live-shell` for `/agmsg spawn` to fire.
  Currently agmsg-off in this project.
- **Vite config env-driven ports** for cleaner parallel worktree
  dev — `PORT` / `VITE_PORT` env pass-through in `vite.config.ts`.
- **Single-arg smoke** (task 6.4) and **unknown-id preflight
  smoke** (task 6.5) — trivial to test once a real
  `dispatch-multi` invocation runs against agmsg-configured setup.
- **Worktree cleanup was missed** post-dispatch: the manual archive
  path (`npm run openspec archive`) skips the cleanup step that
  `/ithy-opsx:archive` skill would offer. Doc note added to skill.
  Future improvement: dispatch-multi's report could literally
  print `/ithy-opsx:archive <id>` commands for the user to paste.
