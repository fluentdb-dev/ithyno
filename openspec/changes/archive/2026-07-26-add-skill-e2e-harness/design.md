## Context

Test / verification-layer change. Sibling of `add-init-scaffold-smoke-test`
(Phase A) and `add-bundle-verification-script` (Phase B) from
[`docs/ideas/2026-07-26-comprehensive-skill-test-plan.md`](../../../docs/ideas/2026-07-26-comprehensive-skill-test-plan.md).
Delivers Phase D: end-to-end skill dispatch on a scaffolded target.

The corrective distribution decision (`distribute-ithy-opsx-via-init-templates`,
archived 2026-07-25) rests on the invariant that a scaffolded target
project — one that received `templates/.claude/…` via `runInit()` —
can drive the full `/ithy-opsx:*` surface with no dependency on
`~/.claude/` or the ithyno dev repo. The `verify-dispatch-e2e-N`
manual rounds (1 – 6) established that the dispatch orchestrator
works, but ran on the dev repo — the exact environment where "the
templates are actually in git" is a coincidence, not a test.

## Goals / Non-Goals

**Goals:**

- Prove end-to-end that `/ithy-opsx:*` resolves and behaves
  correctly when the sole delivery path was `runInit()` — the real
  consumer configuration, not the dev repo.
- Catch regressions that skip past the sibling smoke tests:
  file-present-but-behaviorally-broken (contract drift, endpoint
  removal, prompt reshape).
- Cover every skill named in Phase D of the idea-doc (11 skills)
  with at least one round-trip per skill.
- Keep the harness maintainable — no per-skill script explosion; a
  single `scripts/skill-e2e.mjs` with flow-shaped sections.
- Total wall-clock under 3 minutes for the full matrix on a
  reasonable dev machine, so a maintainer runs it before a release
  without groaning.

**Non-Goals:**

- **Replacing `verify-dispatch-e2e-N`.** Those exercise dispatcher
  internals (agmsg routing, MAX_REWORK_ROUNDS convergence, semaphore
  hold/release, Manager fallback, spawn failure recovery). This
  harness exercises the packaged / scaffolded surface only.
- **Exhaustive matrix.** 11 skills × 3 phases (proposed / coded /
  done) × 2 execution modes (worktree / main-tree) = 66
  permutations. This harness picks 5 representative flows covering
  all 11 skills — a smoke, not a certification suite.
- **CI wiring.** The harness is gated behind `E2E=1` and invoked
  manually or by a pre-release checklist. Nightly CI integration is
  a future change once runtime and stability profile are known.
- **Cross-OS coverage.** Runs on the host that invokes it. Windows /
  Linux extension is `add-windows-ci-matrix`'s scope.
- **Non-Claude worker CLIs.** Copilot / Antigravity / codex / gemini
  routing is exercised by `verify-dispatch-e2e-N`, not here.
- **VSCode extension entry point.** Belongs in a separate
  extension-host activation test.

## Decisions

### D1: Standalone Node script gated by `E2E=1`, not a Vitest test

**Choice**: `scripts/skill-e2e.mjs` invoked via `npm run e2e:skills`,
which sets `E2E=1` and runs the script under plain Node. The script
is NOT registered as a Vitest test file.

**Rationale**:

- **Runtime**: Vitest suites are expected to run in seconds; this
  harness boots a server, runs `git worktree add`, invokes multiple
  Claude CLI round-trips per flow. Under 3 min is fine for a
  standalone script, awful for a `npm test` suite.
- **Isolation**: Vitest runs many test files in parallel (or shares
  a worker pool). This harness needs a dedicated ithyno server on a
  known port and a dedicated scaffolded target per flow — sharing
  workers with unit tests would blow up port allocation and tmpdir
  state.
- **Failure diagnosis**: a standalone script can dump the
  scaffolded target's git log, `openspec/changes/<id>/review.md`
  contents, and server stderr into a maintenance-friendly single
  block when a flow fails. Vitest's assertion output is optimized
  for many small tests, not for post-mortem of a multi-step flow.
- **Precedent**: `scripts/release-build.mjs`,
  `scripts/release-summary.mjs`, and (once landed)
  `scripts/verify-bundle.mjs` are all plain Node scripts. The
  harness fits that family.

**Alternative considered**: Vitest wrapper (a
`test/e2e/skill-e2e.test.ts` that `describe.skipIf(!process.env.E2E)`
gates the whole file). Rejected — the port-allocation + tmpdir
isolation problems remain, and Vitest's failure output is a worse
fit for the failure mode this harness catches.

### D2: Real Claude Code CLI, not a stub

**Choice**: the harness dispatches through the real `claude` CLI
(inherited from the developer's install), same as `verify-dispatch-e2e-N`.
No stubbing of the Manager or the code / review / verify workers.

**Rationale**:

- The whole point of the harness is to prove that `/ithy-opsx:*`
  actually resolves and executes end-to-end in a scaffolded target.
  Stubbing the CLI would reduce the test to "the command file is
  present at the expected path", which is exactly what
  `add-init-scaffold-smoke-test` already asserts — this change would
  add zero coverage.
- Contract drift is the primary failure mode this test catches:
  someone renames `verdict:` frontmatter to `result:`; someone
  changes the `POST /api/changes/<id>/phase` body shape; someone
  moves `review.md` from `<worktree>/openspec/changes/<id>/` to
  `<worktree>/.review/`. A stub would parrot back whatever shape the
  stub author baked in — the test would keep passing while the
  contract silently broke. Only a real CLI round-trip catches this.

**Cost accepted**: the harness requires `claude` on `$PATH`. The
`--help` output notes this prerequisite; if `claude --version` fails
during preflight, the harness exits with a clear "Claude Code CLI
not installed — install `claude` and re-run" message rather than
producing cryptic dispatch failures. Not a friction we can avoid
without lying to ourselves about what we're testing.

**Alternative considered**: stub each skill's file-side effects
(mock `POST /api/changes/…/phase`, write a canned `review.md`, etc.)
and assert only that the command *file resolves* under the target's
`.claude/`. Rejected on the correctness ground above — this would
duplicate `add-init-scaffold-smoke-test` while adding negative value
(a green test that provides false confidence).

### D3: One scaffolded target per flow, not one shared target

**Choice**: each flow (A – E) creates its own `mkdtemp()` target,
runs the flow to completion, tears down. No state sharing across
flows.

**Rationale**:

- **Independence**: Flow A ends with a merged and archived change.
  Flow C starts with a completed change to revert. Reusing Flow A's
  target as Flow C's input would couple the two — a failure in Flow
  A propagates opaquely into Flow C's setup, making triage harder.
- **Parallelism (future)**: independent targets means a future
  version of the harness could run flows in parallel with `Promise.all`,
  each on its own port. Coupled targets would foreclose that.
- **Test hygiene**: the standard test-isolation principle. Cheap
  because scaffolding a target is ~1s (via `runInit` — the same code
  path `add-init-scaffold-smoke-test` proved fast).

**Alternative considered**: one shared target, flows serialize on
it. Rejected — the coupling cost outweighs the ~5s saved on
scaffold repetition.

### D4: Spawn `bin/ithyno` as a subprocess, don't import server module

**Choice**: the harness spawns `bin/ithyno --port <n>` as a child
process with the scaffolded target as its cwd, then hits
`http://localhost:<n>/…` for API calls. It does not
`import(server/index.ts)` and drive the server in-process.

**Rationale**:

- **Realism**: subprocess spawn matches how every real consumer
  starts ithyno (Electron shells out to `bin/ithyno`; VSCode
  extension shells out to `bin/ithyno`; CLI users run `ithyno` at a
  shell). Any port-binding, cwd-resolution, or startup-order bug
  that only manifests under subprocess boot is caught here; the
  in-process module path is not what consumers hit.
- **Signal isolation**: a subprocess can be `SIGKILL`'d
  independently at teardown, without leaking Fastify handles into
  the harness's own event loop. Simpler cleanup, no
  "hanging test" surprises.
- **CWD**: the server needs to resolve `templates/`, `agents.yaml`,
  etc. relative to its startup cwd. Subprocess spawn with `{ cwd:
  scaffoldedTarget }` is the clean way; in-process import needs
  `process.chdir()` which mutates the harness's own state.

**Alternative considered**: import a `createServer()` factory from
`server/index.ts`. Rejected — module-level side effects (there are
several, including `installIthyOpsxSkills` in the pre-distribute
era, and `resolveBundledSkillsRoot` walking) make the in-process
path a footgun. Subprocess is the honest emulation.

### D5: Manager runs the harness under a `--boot-prompt`, not interactively

**Choice**: for flows that need a Manager session (Flows A, B, C, E),
the harness spawns `claude -p '<boot-prompt>'` (subprocess -p mode)
with a boot prompt that names the specific `/ithy-opsx:*` command
to invoke plus any arguments. The harness does NOT open an
interactive PTY.

**Rationale**:

- **Determinism**: `-p` mode reads the prompt, executes, exits.
  Nothing to wait on beyond the process exit and the artifact write.
- **CI-friendly**: no PTY / TTY dependency. Runs the same way in a
  headless CI runner as on a developer's terminal.
- **Precedent**: the Task-tool branch of the dispatch skill uses
  the same shape (subagent boot via `-p`). If this shape breaks for
  the harness, it also breaks production dispatch — the test
  environment matches the runtime environment.

**Cost accepted**: `-p` mode doesn't stream progress the way an
interactive PTY does. The harness compensates by tailing the
scaffolded target's server log (via a `tee` of the subprocess
stderr) so a hung flow is visible in the harness's own stdout.

### D6: Fixture generation happens inside the harness, not as a checked-in fixture

**Choice**: no `test/fixtures/scaffolded-target/` directory is
checked in. The fixture is regenerated per invocation by
`runInit()`.

**Rationale**:

- **No drift**: a checked-in fixture would drift against `templates/`
  and `bin/init.js` — the very things being tested. Every change to
  those would require regenerating the fixture, and a stale fixture
  would silently mask regressions. Regenerating per invocation
  guarantees the fixture reflects HEAD.
- **Small overhead**: `runInit()` on `mkdtemp()` is ~1s (measured
  in `add-init-scaffold-smoke-test`). Running it 5 times (once per
  flow) is ~5s — negligible against the multi-minute total.

**Alternative considered**: check in a fixture and refresh it via a
`npm run fixture:refresh` script. Rejected — drift risk, and the
extra script + regeneration ritual is more moving parts than
regenerating from `runInit` inline.

### D7: Coverage matrix picks flows, not permutations

**Choice**: 5 flows (A – E) covering all 11 skills once each. Not 66
permutations of (skill × phase × execution mode).

**Rationale**:

- **What's actually at risk**: skill resolution (does `.claude/commands/ithy-opsx/<name>.md`
  exist in the scaffolded target?) and artifact contract (does the
  worker write `review.md` at `$REVIEW_MD_PATH` in worktree mode?).
  Both are covered by one round-trip per skill; further permutations
  add hours of runtime for near-zero incremental coverage.
- **Non-Claude worker matrices** (agmsg branch, subprocess branch
  for copilot / antigravity) belong in `verify-dispatch-e2e-N`, not
  here — the scaffolded-target dimension is orthogonal to the
  worker-CLI dimension.
- **Main-tree vs worktree mode**: covered by Flow A running in
  worktree mode (the harder case — `TARGET_PATH` computation, review
  artifact absolute path, `git worktree add` idempotency). Main-tree
  mode is the strict subset; if worktree works, main-tree works
  because `TARGET_PATH` degenerates to `$(pwd)` and the artifact
  contract simplifies.

**Alternative considered**: exhaustive matrix. Rejected — 66
permutations at multi-second-per-permutation dispatch turns a 3-min
harness into a 30-min harness. Bad ratio.

## Risks / Trade-offs

- **`claude` CLI dependency** → the harness requires Claude Code
  installed and authenticated. Mitigation: preflight step checks
  `claude --version` and exits with a clear "Claude Code required"
  message if absent. Acceptable — the entire product assumes Claude
  Code exists.
- **Flakiness under Claude API rate limits** → a full run does
  multiple dispatches; concurrent runs (or a busy developer account)
  could hit rate limits. Mitigation: harness serializes flows
  (D3-parallelism is a future option), and preflight can `sleep 1s`
  between flows if a specific rate-limit error is caught.
- **Runtime creep** → under 3 min today is the target; if Flow A's
  code loop rounds more than once it doubles. Mitigation: seed
  `agents.yaml.maxReworkRounds: 1` in the fixture so Flow A converges
  in a single iteration, and the review verdict is engineered
  (canned change with a trivial impl) to pass on first review.
- **Port collision** → picks a random free port at startup via
  `node:net` `.listen(0)` trick. If the harness is invoked
  concurrently by multiple developers on the same shared box, each
  gets an independent port. Not a practical risk on developer
  machines.
- **Claude CLI subprocess hang** → `-p` mode should always exit;
  historically a stuck subprocess is the loudest failure. Mitigation:
  per-flow wall-clock ceiling (60s per skill invocation), enforced
  by `AbortController` on the child process. On ceiling breach, kill
  and mark the flow failed with a clear "flow X, skill Y timed out
  after 60s" message.
- **Test dependencies leak into production** → the harness lives in
  `scripts/`, not shipped in the npm tarball. Verified via the same
  `add-init-scaffold-smoke-test` package-shape check — `scripts/`
  is not in `files`.
- **Fixture-target's own git identity** → `runInit` seeds a git repo;
  the harness commits into it. Uses `-c user.name=<harness> -c
  user.email=<...>` on each `git commit` so it does not inherit the
  developer's global config. Documented in the script's header.

## Migration Plan

None. New script, opt-in via `E2E=1`. Rolling back is `git revert`
of the impl commit. No user-facing surface (no CLI subcommand,
no HTTP endpoint, no UI). If the harness itself becomes stale, a
maintainer runs `npm run e2e:skills` and fixes the flow that
regressed — or deletes the flow if the covered skill was intentionally
removed.

## Open Questions

- **Should Flow A's code stage use `/opsx:apply` or
  `/ithy-opsx:apply`?** Dispatch skill's guardrail warns against
  `/ithy-opsx:apply` as a code worker (interactive commit
  confirmation cannot be answered from a boot prompt). Harness
  should use `/opsx:apply` for code and rely on Manager-commit
  contract to finalize. Confirmed by dispatch skill's step 6 guard.
  Not really open — the answer is baked into the dispatch contract.
- **Do we run against `main` or `develop`?** The harness runs
  wherever the developer invokes it. Convention: run from `develop`
  before a release-cut. No decision needed here; documented in the
  script `--help`.
- **Does the harness ever get its own scaffolded-target's
  `agents.yaml.tmpl` values, or does `runInit` write a canned
  minimal one?** `runInit` writes the template default (see
  `writeAgentsYaml`); the harness accepts that default and can
  patch it in-place (e.g., setting `maxReworkRounds: 1`) as a fixture
  seeding step. No policy question here; implementation detail.
