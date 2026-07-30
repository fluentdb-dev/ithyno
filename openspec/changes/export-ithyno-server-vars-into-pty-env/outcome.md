# Outcome

## ✅ Worked

- **Two-sided fix, neither side has to know about the other.**
  Server writes `ITHYNO_PORT` / `ITHYNO_BASE` into the PTY env; skill
  docs are rewritten to describe env-based resolution + fallback. If
  a future consumer changes port picking or hardcodes something new,
  neither side alone can break the contract without the other
  noticing.
- **Explicit `"4321"` fallback preserved the CLI dev workflow.** No
  regression for `npm run dev` — that path never sets `PORT` and now
  gets an explicit default instead of relying on the skill's own
  hardcoded value. The fallback lives in one place (`pty.ts`)
  instead of scattered across every skill file.
- **The four skill files stayed byte-identical between `.claude/`
  and `templates/.claude/`.** `scripts/verify-bundle.mjs`'s drift
  guard catches any divergence at bundle time; running
  `diff .claude/... templates/.claude/...` after each edit was
  cheaper than trusting the CI check.

## ⚠️ Surprises

- **The judgment "this is trivial, skip propose" was wrong.** The
  fix adds a new observable contract to the PTY env — any future
  skill can rely on `ITHYNO_BASE`. The retrofit is honest about
  that: implementation landed in commit `c5beae8` and the proposal
  came after. CLAUDE.md's retrofit rule is explicit about this
  path, so it's not a shameful outcome — but the initial
  "trivial fix" framing was too aggressive. Rule of thumb:
  **anything that adds a new env var, endpoint, or field to a
  contract other consumers can read is spec-level.**
- **`server/sync/pty.test.ts` doesn't verify the actual env shape.**
  The test file mocks `node-pty` and never observes the child
  env — the assertion surface is the shape of `ptyStartup()`'s
  return value, not the shell env. Adding a real assertion would
  require a spawn-a-real-shell integration test, which the repo
  doesn't have for PTY. Left the manual smoke test as the
  authoritative verification (task 5.1 / 5.2), same shape as
  every other PTY-behavior change in this repo.
- **`ITHYNO_SESSION_TOKEN` was never in the spec either.** It landed
  by `expose-manager-activity-per-change` and no requirement
  formalized its export. This change's ADDED requirement covers all
  three vars together — a small win in spec coverage on top of the
  bug fix.

## 🔁 Differently

- **Would have caught this in dispatch e2e testing if we ran it
  under Electron.** Rounds 1–6 of the dispatch e2e verification all
  ran from the CLI dev workflow (port 4321), where the bug is
  invisible. A future E7 (or a permanent smoke) that opens ithyno
  in Electron and runs a real dispatch would have caught this in
  minutes. Filed as a follow-up.
- **Would have proposed first if I'd noticed the "adds a new env
  var" framing.** The skill docs said "adjust if ITHYNO_PORT
  differs" and I read that as "the var already exists, we just have
  to export it" — but "differs" implied the var was already
  exported by SOMETHING, which was false. Reading the skill docs
  literally would have shown the bug more precisely up front.

## 🌱 Follow-ups

- **E2E dispatch smoke on the Electron packaged binary.** Add a
  step to `add-release-build-workflow`'s bundle-verification-script
  that launches the packaged app, spawns a Manager, and runs
  `curl "$ITHYNO_BASE/api/state"` — asserts the response is 200 and
  the URL matches the ephemeral port. Would catch every future
  regression in this contract.
- **Formalize the rest of the PTY env explicitly.** `TERM`,
  process.env inheritance, and future additions (Windows PATH
  fixups?) all live implicitly in pty.ts. Follow-up proposal to
  ADD a "PTY environment shape" requirement listing everything
  explicit, so future edits require a spec update.
- **VSCode-extension symmetry test.** The extension spawns the
  same server via the same code path, but the VSCode PTY (not the
  ithyno-in-VSCode PTY) has its own env plumbing. Confirm both
  sides work — probably fine given they share `server/sync/pty.ts`,
  but a manual verification pass is worth the 5 minutes.
