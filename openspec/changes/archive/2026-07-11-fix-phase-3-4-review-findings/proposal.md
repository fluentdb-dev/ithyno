---
tags: [bug, phase-3, phase-4, phase-5, area/agents, area/dispatch, area/web]
---

# Fix Phase 3+4+5 review findings

## Why

Multi-angle code review of the accumulated Phase 3+4+5.1 work on
`phase-workflow` (against `main`) surfaced 15 correctness findings.
Several silently defeat features that were nominally landed:

- **Phase 3.5 review verdicts are never populated** for worktree-backed
  agents — `runner.finish()` reads `review.md` from `projectRoot`
  instead of the job's `worktreePath`, so the Manager loop cannot
  distinguish pass from needs-rework.
- **Cancel / timeout leaks the pool slot, the changeId lock, and skips
  every finish-time side-effect** — the exit-handler guard
  `if (job.status === "running")` short-circuits `finish()` whenever
  cancel has already flipped status.
- **Runtime abstraction (Phase 3.1) is Claude-only** — `promptStyle: stdin`
  runtimes get a spurious Claude-specific `-p <prompt>` unshift AND
  stdin is spawned as `"ignore"`, so no runtime other than Claude Code
  actually works.
- **ExecutionPicker crashes** when `agents[0]` is a runtime-backed agent
  (`.args.join(' ')` on `undefined`) — user-facing white-screen.

Full finding list is in `design.md`. All are correctness bugs; no new
capability is added. Fixes bring the implementation in line with the
existing specs.

## What Changes

1. **server/agents/runner.ts** — parse review.md from worktreePath; make
   finish() reach for cancel/timeout paths too; move `locks.delete`
   after the artifact scan; route stdin promptStyle through child stdin
   with a proper writer; clean up worktree/pool on resolve() throw.
2. **server/agents/dispatch.ts** — fix `stdoutTail` byte-boundary +
   quadratic concat; remove or wire `promptSuffix`; block timeout return
   until finish() has populated artifactPaths/verdict.
3. **server/agents/artifact-scan.ts** — use `git status -z` (or handle
   rename + quoted paths) so review.md renames + non-ASCII change ids
   surface correctly.
4. **server/needs-human.ts** — treat the footer separator as only the
   FINAL `---`, not any body-inline horizontal rule, to preserve
   markdown-formatted answers.
5. **server/sidecar.ts** — call `watcher.recordWrite()` around every
   sidecar write to break the self-echo → duplicate broadcast loop.
6. **server/index.ts** — reset `runtimeDetectionCache` on agents.yaml
   reload; make the needs-human editor-fallback path both cross-platform
   (path.sep) AND narrower (only `openspec/changes/<id>/needs-human.md`
   directly, not any subdir file).
7. **web/src/components/ExecutionPicker.tsx** — guard `.command`/`.args`
   access; show a runtime-mode summary for runtime-backed agents.
8. **web/src/components/Kanban.tsx** — gate the Archive button on
   `!job || job.status !== "running"`.
9. **web/src/util/changeState.ts** — `startableCandidates` respects
   `change.phase === "done"` (phase is authoritative over progress).

Non-goals: refactors, altitude / reuse cleanup (Angle F/G/I findings
were dropped — correctness only per code-review skill's severity cap).

## Impact

- Specs: none (all fixes align to existing requirements)
- Code: server/agents/{runner,dispatch,artifact-scan}.ts;
  server/{needs-human,sidecar,index}.ts;
  web/src/{components/ExecutionPicker,components/Kanban,util/changeState}.ts
- Tests: extend existing suites where each fix has an observable
  behavior anchor; skip pure-refactor cases
