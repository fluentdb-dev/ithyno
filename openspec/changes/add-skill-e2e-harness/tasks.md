# Tasks

## 1. PENDING annotation on landed spec

- [ ] 1.1 Insert a `PENDING MODIFIED` annotation directly under `### Requirement: Ithyno Init scaffolds `/ithy-opsx:*` into the target project` in `openspec/specs/dashboard/spec.md`. The annotation SHALL name `add-skill-e2e-harness` and give a one-line reason (appends a scaffolded-target skill-e2e harness spec paragraph and matching scenarios). This is additive to the existing `add-init-scaffold-smoke-test` PENDING annotation on the same requirement — both remain until their respective changes archive.
- [ ] 1.2 Verify the annotation renders correctly (grep for both change ids under that requirement heading).

## 2. Harness skeleton

- [ ] 2.1 Create `scripts/skill-e2e.mjs` — plain Node ESM, matching the shape of `scripts/release-build.mjs`. Header comment names purpose, `E2E=1` gate, and the `--help` flag surface.
- [ ] 2.2 Preflight step: check `E2E=1` is set (exit with instructional message otherwise); check `claude --version` succeeds (exit with "Claude Code CLI required" message otherwise).
- [ ] 2.3 Argument parser: support `--only <flow>`, `--keep-tmp`, `--server-port <n>`, `--help`. Implement without a dep — plain `process.argv` slicing is enough.
- [ ] 2.4 Extract shared helpers into `scripts/skill-e2e/` subdir if the file grows past ~600 LoC — otherwise keep inline. Decide during impl.

## 3. Fixture generator

- [ ] 3.1 Implement a `createScaffoldedTarget()` helper: `mkdtemp` a directory; import `runInit` from `../bin/init.js`; invoke `runInit({ targetDir, autoGitInit: true, quiet: true })`; seed an initial commit so a default branch exists (`git commit --allow-empty -m "init"` with `-c user.name=… -c user.email=…` to avoid inheriting developer's global config).
- [ ] 3.2 Return `{ targetDir, cleanup }` — the `cleanup()` handle removes the tmpdir unless `--keep-tmp` was set.
- [ ] 3.3 Register cleanup with `process.on('exit', ...)` AND `process.on('SIGINT', ...)` so a Ctrl-C mid-flow doesn't leak tmp directories.
- [ ] 3.4 Optional fixture-seeding helper `seedInFlightChange(targetDir, { id, phase })` for Flow A's merge / archive steps.

## 4. Server lifecycle

- [ ] 4.1 Implement `startServer({ targetDir, port })`: `spawn('node', [path.join(repoRoot, 'bin/ithyno.js'), '--port', String(port)], { cwd: targetDir, stdio: ['ignore', 'pipe', 'pipe'] })`; tail stderr into the harness log for post-mortem visibility; wait for `Listening on http://localhost:<port>` line before resolving.
- [ ] 4.2 Random-port picker: use `node:net` `.listen(0)` → read port → close → return, or accept `--server-port` override.
- [ ] 4.3 Implement `stopServer(child)`: send SIGTERM, wait ≤ 5s for exit, then SIGKILL. Verify the port is no longer bound before returning.
- [ ] 4.4 Serialize server start/stop per flow — no two flows share a server or a port.

## 5. Flow A — happy-path dispatch chain (worktree mode)

- [ ] 5.1 Seed a trivial one-file change in the scaffolded target: `openspec new change flow-a-happy` (via the target's own `openspec` CLI); write minimal `proposal.md` / `tasks.md` / `specs/<capability>/spec.md` / plus a stub impl file the code stage will edit.
- [ ] 5.2 Patch `agents.yaml` in the target to `maxReworkRounds: 1` so the code ↔ review loop converges in one iteration.
- [ ] 5.3 Dispatch `/ithy-opsx:apply flow-a-happy` via `claude -p '<boot-prompt>'` with the target as cwd. Assert an `agent/flow-a-happy` branch exists with an `impl:` commit.
- [ ] 5.4 Dispatch `/ithy-opsx:review flow-a-happy`. Assert `review.md` at the exact absolute `$REVIEW_MD_PATH` (worktree form) with parseable `verdict: pass` frontmatter.
- [ ] 5.5 Dispatch `/ithy-opsx:verify flow-a-happy`. Same shape.
- [ ] 5.6 Dispatch `/ithy-opsx:merge flow-a-happy`. Assert a merge commit is present on the target's default branch.
- [ ] 5.7 Dispatch `/ithy-opsx:archive flow-a-happy`. Assert the change directory moved to `openspec/changes/archive/<date>-flow-a-happy/` and the target's `openspec/specs/<capability>/spec.md` was updated.
- [ ] 5.8 Per-skill wall-clock ceiling of 60s enforced via `AbortController`; on breach, kill the child, mark the skill failed, continue to the next flow (do not abort the whole harness).

## 6. Flow B — escalate + answer (needs-human)

- [ ] 6.1 Seed an in-flight change `flow-b-escalate` at phase `coded`.
- [ ] 6.2 Dispatch `/ithy-opsx:escalate flow-b-escalate "test question"`. Assert phase transitions to `needs-human` (via `GET /api/changes/flow-b-escalate/phase`) and `needs-human.md` is present.
- [ ] 6.3 Dispatch `/ithy-opsx:answer flow-b-escalate "test answer"`. Assert phase transitions out of `needs-human` and the answer is recorded in the artifact.

## 7. Flow C — revert

- [ ] 7.1 Seed a completed change in the scaffolded target's archive (`openspec/changes/archive/<date>-flow-c-completed/`) with a spec delta that added a requirement.
- [ ] 7.2 Dispatch `/ithy-opsx:revert flow-c-completed`. Assert:
  - `openspec/changes/revert-flow-c-completed/` exists with `proposal.md`, `design.md`, `specs/<capability>/spec.md`, `tasks.md`.
  - The current spec's target requirement gained a `PENDING` annotation.
  - The archived target's proposal gained a `REVERTED` annotation (Case α).
  - `openspec validate revert-flow-c-completed --strict` passes.

## 8. Flow D — import

- [ ] 8.1 Create a *second* `mkdtemp()` target with no `openspec/` — the "external project to be imported".
- [ ] 8.2 Dispatch `/ithy-opsx:import <external-target-path>` from the scaffolded target (the Manager side).
- [ ] 8.3 Assert the external target ends up with a first-draft `openspec/specs/` set AND `openspec/GENERATED.md` (the completion marker).
- [ ] 8.4 Tear down both targets on flow exit.

## 9. Flow E — dispatch-multi

- [ ] 9.1 Seed two in-flight changes `flow-e-a` and `flow-e-b`, both at phase `proposed`.
- [ ] 9.2 Dispatch `/ithy-opsx:dispatch-multi flow-e-a flow-e-b`. Assert both changes' phases advance (via `GET /api/changes/<id>/phase` for each) AND that Manager processed both `change:<id>` message routes correctly.
- [ ] 9.3 Ceiling: 120s for the combined flow (2× the single-skill ceiling).

## 10. Coverage bookkeeping

- [ ] 10.1 At harness end, print a per-skill pass / fail summary — every skill named in Phase D of the idea-doc SHALL appear in the summary with a `PASS` / `FAIL` / `SKIP` marker.
- [ ] 10.2 Assert every Phase D skill was exercised at least once — the summary MUST NOT have an "untested" gap. If a skill is intentionally skipped (e.g., via `--only`), the summary marks it `SKIP` and the exit code is unaffected.
- [ ] 10.3 Exit 0 if every non-skipped skill passed; exit 1 otherwise.

## 11. `package.json` wiring

- [ ] 11.1 Add `"e2e:skills": "E2E=1 node scripts/skill-e2e.mjs"` to root `package.json` `scripts`.
- [ ] 11.2 Verify no other `scripts` entry collides.
- [ ] 11.3 Do NOT wire into `npm test`, `npm run typecheck`, `npm run build`, or any `release:*` script — the harness is intentionally on-demand.

## 12. Documentation

- [ ] 12.1 Add `npm run e2e:skills` to `CLAUDE.md`'s "Useful commands" section with a one-line description ("scaffolded-target e2e harness for `/ithy-opsx:*` skills, gated behind `E2E=1`").
- [ ] 12.2 Add a `--help` output block in the harness script that names each flow, the `--only` values, and the `claude` CLI prerequisite.

## 13. Verification

- [ ] 13.1 `npm run openspec -- validate add-skill-e2e-harness --strict` passes.
- [ ] 13.2 `npm run e2e:skills` completes end-to-end in under 3 minutes on the impl author's dev machine, prints the per-skill summary, exits 0.
- [ ] 13.3 Manual regression check: temporarily rename `templates/.claude/commands/ithy-opsx/apply.md` to `apply.md.bak`, run `npm run e2e:skills`, MUST fail Flow A at the first `/ithy-opsx:apply` invocation with a named error. Rename back; MUST pass again. Do NOT commit the temporary rename.
- [ ] 13.4 Manual regression check: temporarily edit the review-worker slash-command template so its output uses `result:` instead of `verdict:` in the review.md frontmatter, run `npm run e2e:skills`, MUST fail Flow A at the review step with a parseable-frontmatter error naming the offending path. Revert; MUST pass again. Do NOT commit the temporary edit.
- [ ] 13.5 `npm test && npm run typecheck && npm run build` still pass — no regression from adding the script (which is not imported by anything under test).

## 14. Post-impl

- [ ] 14.1 Write `openspec/changes/add-skill-e2e-harness/outcome.md` with the four suggested sections (✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups).
- [ ] 14.2 Note whether Flow B / C / D each caught anything the sibling smoke tests missed — if not, the harness's incremental value is lower than expected and worth flagging as a Follow-up.
- [ ] 14.3 `/ithy-opsx:archive add-skill-e2e-harness`.
