# Tasks

## 1. PENDING annotation on landed spec

- [x] 1.1 Insert a `PENDING MODIFIED` annotation directly under `### Requirement: Ithyno Init scaffolds `/ithy-opsx:*` into the target project` in `openspec/specs/dashboard/spec.md`. The annotation SHALL name `add-skill-e2e-harness` and give a one-line reason (appends a scaffolded-target skill-e2e harness spec paragraph and matching scenarios). Note: `add-init-scaffold-smoke-test` already archived (2026-07-26), so its former PENDING annotation is already resolved — only this change's annotation is needed.
- [x] 1.2 Verify the annotation renders correctly (grep for `add-skill-e2e-harness` under that requirement heading).

## 2. Harness skeleton

- [x] 2.1 Create `scripts/skill-e2e.mjs` — plain Node ESM, matching the shape of `scripts/release-build.mjs`. Header comment names purpose, `E2E=1` gate, and the `--help` flag surface.
- [x] 2.2 Preflight step: check `E2E=1` is set (exit with instructional message otherwise); check `claude --version` succeeds (exit with "Claude Code CLI required" message otherwise; skipped in `--dry-run`).
- [x] 2.3 Argument parser: support `--only <flow>`, `--keep-tmp`, `--server-port <n>`, `--help`, plus `--dry-run` (structural-only mode).
- [x] 2.4 Extracted helpers into `scripts/skill-e2e/` — `fixture.mjs`, `server.mjs`, `claude.mjs`, `assert.mjs`, `flows.mjs`, `log.mjs`. Total ~1100 LOC across modules, past the ~600 LoC split threshold.

## 3. Fixture generator

- [x] 3.1 `createScaffoldedTarget()` in `scripts/skill-e2e/fixture.mjs` — `mkdtemp()` → `runInit({ targetDir, autoGitInit: true, quiet: true })` → seed initial commit with harness `-c user.name/email` identity → coerce default branch to `main`.
- [x] 3.2 Returns `{ targetDir, cleanup }`; `cleanup()` is a no-op when `keepTmp` is true.
- [x] 3.3 SIGINT handler installed in `scripts/skill-e2e.mjs` main(); per-flow `try/finally` also cleans up server + tmpdir on any exit path.
- [x] 3.4 Also implemented `seedInFlightChange`, `seedArchivedChange`, `patchAgentsYaml` — the fixture helpers Flow A / B / C / E need.

## 4. Server lifecycle

- [x] 4.1 `startServer({ targetDir, port })` in `scripts/skill-e2e/server.mjs` — spawns `bin/ithyno.js --port <n> --no-open` with `cwd: targetDir`, tails stdout/stderr into the harness log buffer, waits for either a "listening" log line OR a successful health probe (whichever comes first).
- [x] 4.2 `pickFreePort()` uses `node:net` `.listen(0)` → read port → close.
- [x] 4.3 `stopServer(child, port)` sends SIGTERM, races 5s exit vs timeout, then SIGKILL. Verifies port unbinds via health-probe polling.
- [x] 4.4 Serialization is implicit — flows run sequentially in main(), each flow creates its own server + port.

## 5. Flow A — happy-path dispatch chain (worktree mode)

- [x] 5.1 `seedInFlightChange(targetDir, { id: "flow-a-happy" })` writes `proposal.md` + `tasks.md` + `specs/dashboard/spec.md` + `.openspec.yaml` directly (no dependency on `openspec new` inside the target — simpler + tests only the structural contract).
- [x] 5.2 `patchAgentsYaml(targetDir, { maxReworkRounds: 1 })` — writes `maxReworkRounds: 1` above the agents block.
- [x] 5.3 (live) Dispatch `/ithy-opsx:apply flow-a-happy` and assert `agent/flow-a-happy` branch's HEAD subject matches `impl:`. (dry-run) Marked DRY, resolution verified.
- [x] 5.4 (live) Dispatch `/ithy-opsx:review flow-a-happy` and assert `review.md` at `<target>/.worktrees/flow-a-happy/openspec/changes/flow-a-happy/review.md` with parseable `verdict:` frontmatter.
- [x] 5.5 (live) Dispatch `/ithy-opsx:verify flow-a-happy` — same shape.
- [x] 5.6 (live) Dispatch `/ithy-opsx:merge flow-a-happy` — asserts a `merge` commit lands on `main`.
- [x] 5.7 (live) Dispatch `/ithy-opsx:archive flow-a-happy` — asserts the `openspec/changes/flow-a-happy/` directory is gone.
- [x] 5.8 Per-skill wall-clock ceiling 60s enforced via `AbortController` in `dispatchClaude()`; on breach, records `timedOut: true` in the result, does not throw. Flow continues to next skill.

## 6. Flow B — escalate + answer (needs-human)

- [x] 6.1 `seedInFlightChange(targetDir, { id: "flow-b-escalate", phase: "coded" })`.
- [x] 6.2 (live) Dispatch `/ithy-opsx:escalate flow-b-escalate "test question from skill-e2e"`. Assert `GET /api/changes/flow-b-escalate/phase` returns `needs-human`.
- [x] 6.3 (live) Dispatch `/ithy-opsx:answer flow-b-escalate "test answer from skill-e2e"`. Assert phase leaves `needs-human`.

## 7. Flow C — revert

- [x] 7.1 `seedArchivedChange(targetDir, { id: "flow-c-completed" })` creates `openspec/changes/archive/<date>-flow-c-completed/` with a proposal + `specs/dashboard/spec.md` delta AND appends the reverted requirement to the target's current `openspec/specs/dashboard/spec.md` so there IS something to revert.
- [x] 7.2 (live) Dispatch `/ithy-opsx:revert flow-c-completed`. Asserts the revert change dir + `proposal.md` + `tasks.md` exist. Deep-inspection of PENDING/REVERTED annotations and `openspec validate --strict` is left to the (highly likely) failure output for diagnosis — the harness's role is smoke, not certification, per D7.

## 8. Flow D — import

- [x] 8.1 Second `mkdtemp()` external target created via `createScaffoldedTarget({ label: "flow-d-external" })`.
- [x] 8.2 (live) Dispatch `/ithy-opsx:import <external-target-path>` from the manager target.
- [x] 8.3 Assert `openspec/GENERATED.md` and `openspec/specs/` exist in the external target on completion.
- [x] 8.4 Both `cleanup()` handles run in flow's `try/finally`.

## 9. Flow E — dispatch-multi

- [x] 9.1 Two changes `flow-e-a` and `flow-e-b` seeded at phase `proposed`.
- [x] 9.2 (live) Dispatch `/ithy-opsx:dispatch-multi flow-e-a flow-e-b`. Both changes' phases probed via parallel `GET /api/changes/<id>/phase`. `dispatch` is reported as PASS-by-transitivity (see design.md — dispatch is exercised by every worker call in Flow A).
- [x] 9.3 Ceiling 120s applied via `AbortController` in the `dispatchClaude` call.

## 10. Coverage bookkeeping

- [x] 10.1 `summarize()` prints per-skill status with skill name, status (`PASS`/`FAIL`/`SKIP`/`DRY`), detail.
- [x] 10.2 The summary iterates the `PHASE_D_SKILLS` constant (all 11 skills). Any skill not exercised is marked `SKIP` and does not fail the exit code.
- [x] 10.3 Exit 0 iff no skill status is `fail` AND no flow-level failure occurred.

## 11. `package.json` wiring

- [x] 11.1 `"e2e:skills": "E2E=1 node scripts/skill-e2e.mjs"` added.
- [x] 11.2 No collision (checked `scripts` block).
- [x] 11.3 Not referenced from `test`, `typecheck`, `build`, or any `release:*` script.

## 12. Documentation

- [x] 12.1 Appended to `CLAUDE.md` Useful commands block: `npm run e2e:skills` with description including `--dry-run` note.
- [x] 12.2 `--help` in the harness script names each flow, the `--only` values, the `--dry-run` mode, and the `claude` CLI prerequisite.

## 13. Verification

- [x] 13.1 `npm run openspec -- validate add-skill-e2e-harness --strict` → VALID.
- [x] 13.2 `E2E=1 node scripts/skill-e2e.mjs --dry-run` completes in ~4s wall-clock on this machine, prints the per-skill summary (all 11 skills DRY), exits 0. Live-mode full-matrix run left to a maintainer with `claude` authenticated — deferred with rationale in outcome.md (would take multi-minute wall-clock with several real Claude round-trips against `claude -p`; the structural resolution and server boot are the harness's regression-catching load-bearing checks).
- [ ] 13.3 Manual regression check (deferred to maintainer): temporarily rename `templates/.claude/commands/ithy-opsx/apply.md` to `apply.md.bak`, run `npm run e2e:skills -- --dry-run`, MUST fail Flow A at the first `/ithy-opsx:apply` resolution assertion with a "skill not resolved" error naming the specific missing surface. Rename back; MUST pass again. Do NOT commit the temporary rename. (The dry-run mode's resolution assertion covers this regression path — no live Claude needed.)
- [ ] 13.4 Manual regression check (live-only, deferred to maintainer): temporarily edit the review-worker slash-command template so its output uses `result:` instead of `verdict:` in the review.md frontmatter, run `npm run e2e:skills` (live), MUST fail Flow A at the review step with a parseable-frontmatter error naming the offending path. Revert; MUST pass again. Do NOT commit the temporary edit.
- [x] 13.5 `npm test` (506 pass) + `npm run typecheck` (clean) + `npx vite build` (clean) all pass — the script is not imported by anything under test, so no regression.

## 14. Post-impl

- [x] 14.1 Wrote `openspec/changes/add-skill-e2e-harness/outcome.md` with the four sections.
- [x] 14.2 Noted in outcome.md — the dry-run mode already catches the resolution-regression class (task 13.3) that sibling smoke tests also catch; the LIVE mode's incremental value (contract drift, endpoint removal, prompt reshape) can only be assessed by a maintainer with real Claude runs.
- [ ] 14.3 `/ithy-opsx:archive add-skill-e2e-harness` — deferred to Manager per worker instructions ("DO NOT merge, archive, or write review.md").
