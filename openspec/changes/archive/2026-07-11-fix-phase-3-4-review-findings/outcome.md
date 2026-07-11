# Outcome: fix-phase-3-4-review-findings

## ✅ Worked

- **15 findings → 15 fixes in one change.** All correctness bugs from
  the phase-workflow multi-angle review landed in a single bundle
  because they share files (runner.ts × 5, dispatch.ts × 3, index.ts
  × 3) and splitting them would have produced constant merge conflicts
  on the same hunks.
- **Idempotent `finalize()` unblocks the cancel path.** The old
  `if (job.status === "running")` guard was cheap to remove because
  the artifact scan is already awaited before the status flip — cancel
  and normal exit now converge on the same code path, and a bool
  `finalized` flag prevents double-run. Bug fix, pool release, WS
  event emit, verdict parse all became free side-effects.
- **`initialInputMode` on `resolve()` cleanly threads promptStyle to
  the runner.** No new interface, no giant if/else in runner.ts —
  registry.ts's resolve() knows the promptStyle so it just returns
  the mode string, and runner.ts branches on that. This is the
  correct altitude per Angle I's observation, without doing a full
  refactor.
- **`git status -z` disposes of the porcelain-parse hazards
  wholesale.** Renames, quoted paths, spaces, non-ASCII — all just
  work because `-z` doesn't quote or joins-with-arrow. The parser
  became simpler, not more complex.
- **Byte-accurate `stdoutTail` is now trivial.** `Buffer.subarray(...)
  .toString("utf8")` handles both the byte cap and the mid-codepoint
  replacement in one call. The rewrite is also linear-time (no more
  quadratic string concat).

## ⚠️ Surprises

- **Spec deltas required even for pure bug fixes.** OpenSpec's
  validator refuses a change with zero `specs/*/spec.md` deltas.
  Landed a MODIFIED delta on `Job Model Includes Verdict` to record
  the worktreePath / cancel-completes-verdict clarifications — the
  fix now doubles as spec reinforcement, which is arguably better
  than a silent code-only patch.
- **`useStartFlow.tsx` was the ONLY consumer of ExecutionPicker's
  narrow prop shape.** Verified with grep; widening `firstAgent` to
  optional command/args was a one-file change plus the picker render
  branch. If more consumers had existed the fix would have been
  spec-level (breaking API to shared component).
- **`hoist runtimeDetectionCache` triggered a symmetry bug.**
  Initially wrote the reset callback as `runtimeDetectionCache = null`
  directly, which put the identifier reference above its `let`
  declaration. Wrapping in a `function clearRuntimeDetectionCache()`
  works because function declarations hoist while `let` doesn't —
  small readability win, no functional change.
- **The `stdoutTail` "cap by UTF-8 bytes" regression test caught a
  subtle off-by-one first draft.** Initial rewrite used `<` not `<=`
  on the byte compare, silently dropping the last chunk's bytes when
  the running total exactly hit maxBytes. Fixed before commit.

## 🔁 Differently

- **One bundled change vs 15 tiny changes.** Right call. Splitting
  would've been ~15 propose/impl/validate/archive cycles for maybe
  4–7 LOC each — pure ceremony. The tradeoff was a bigger `design.md`
  and a longer `tasks.md`, both cheap.
- **Deferred stdin promptStyle integration test.** No `aider` /
  `copilot` on CI PATH. The unit-level path is exercised by the
  registry-runtime test suite (which validates promptStyle
  round-trips through resolve()); the spawn side is code-review-only
  until Phase 6 lands a runtime detection harness.

## 🌱 Follow-ups

- **Wire `promptSuffix` if the Manager loop actually needs it.**
  Removed for now; the design is unclear (append to base prompt? use
  as `-p` override?). Revisit when the Manager loop hits a use case
  the current API can't satisfy.
- **Reduce runner.ts surface.** Angle I's altitude findings (giant
  resolve() switch, needs-human grafted onto phase, artifact→parser
  registry) are still open. They're refactors, not bug fixes, so
  they belong in a `refactor-*` change once Phase 6 is done.
- **Address dispatch.ts `job disappeared` unhandled 500.** Not fixed
  here — I made `waitForJobCompletion` more resilient in prior
  finding but the `throw new Error("...disappeared")` still bubbles.
  Wrap the fastify handler in try/catch or convert the throw to a
  clean return.
- **Widen `AgentPublic` regression test coverage.** The
  changeState.test.ts fix (add role/specialties/concurrency/dedicated
  to the fixture agent) is a canary — any future consumer that reads
  a required field will hit the same TS error, but there's no
  builder helper. A `mkAgentFixture(overrides)` in a test utility
  would prevent the paper-cut.
