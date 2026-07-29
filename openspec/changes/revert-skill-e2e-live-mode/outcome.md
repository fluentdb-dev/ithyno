# Outcome — revert-skill-e2e-live-mode

Landed 2026-07-27. Reshapes `add-skill-e2e-harness` (archived 2026-07-26)
from a live-Claude-CLI dispatch harness to a structural-only harness,
and moves live semantic verification to a manual procedure documented
at `docs/skill-e2e-manual-verification.md` keyed to Electron .app and
VSCode extension surfaces.

## ✅ Worked

- **Case α revert followed the CLAUDE.md ceremony end-to-end.** PENDING
  MODIFIED on the landed Init requirement, PARTIALLY REVERTED on the
  archived proposal, MODIFIED delta with the full reworked requirement.
  Strict validate on first try.
- **Structural harness ended up smaller and greener** than the live
  version. `flows.mjs` 821 → 204 LoC. `E2E=1 npm run e2e:skills` in
  ~7.7s (was 15 min live), 11/11 PASS on first run.
- **Manual doc keyed to real user surfaces** (Electron .app / VSCode
  extension), not CLI. Matches how consumers actually invoke skills.
- **PARTIALLY REVERTED language** is honest about scope — the fixture
  generator, server lifecycle, and skill-file resolution assertions
  from `add-skill-e2e-harness` stay. Only the live-mode aspirations
  are gone.

## ⚠️ Surprises

- **`/ithy-opsx:apply` and `:archive` interactive commit-approval
  steps** are the killer. The dispatch skill itself documents this at
  line 141 ("`/ithy-opsx:apply` is NOT supported as a code worker
  prompt — its interactive 'commit OK?' confirmation cannot be
  answered from an agmsg pane and the stage hangs to the ceiling").
  The harness walked into the same trap. Structural coverage sidesteps
  it; manual verification via interactive Terminal (Electron / VSCode)
  handles the approval prompts as they were designed for.
- **Even `/opsx:apply` (upstream, non-interactive)** produced a clean
  worktree post-invocation in `-p` mode, likely because the fixture
  tasks.md was pre-checked (round 3 fix). Deeper root cause was that
  the scaffolded target lacked `/opsx:*` files (round 6 root cause
  fix: fixture must run `openspec init`). Multiple interacting bugs,
  hard to unravel from `-p`'s stderr/stdout alone.
- **Round-to-round non-determinism.** Round 6 had apply PASS; round 7
  had apply FAIL with the same code path. `claude -p`'s behavior isn't
  fully deterministic across invocations, and no amount of harness
  hardening removes that.

## 🔁 Do Differently

- **Should have written the manual doc first**, invoking the CLI-only
  version I originally drafted, before attempting live automation. The
  manual doc surfaced immediately that the real user surface is
  Electron / VSCode, not `bin/ithyno` directly — which reframes the
  entire verification question. If I'd started there, the ceiling-vs-
  permission-vs-port harness bug hunt would have been recognized as
  yak shaving on the wrong yak sooner.
- **Iterative fix commits (5 rounds) polluted the git log** without
  landing a green state. This revert bundles the outcome as a single
  clean spec-level change instead. Lesson: when harness live mode
  fails 3+ times with different fixes each round, that's the signal
  to step back and reshape, not to iterate further.

## 🌱 Follow-ups

- **Run the manual verification** doc against a real Electron .app +
  VSCode extension for the next release cut. Report findings as the
  first exercise of the new procedure. If gaps surface (missing
  fail-mode, unclear expected outcome), the doc should be tightened.
- **Consider a `verify-dispatch-e2e-N` shell script** (N=7+) that
  automates the setup portion of the manual doc (mktemp + init +
  server start) so the maintainer only has to type slash commands and
  record results. Not this change; separate scope.
- **When Claude Code CLI ships a deterministic non-interactive mode**
  (or when the skills are refactored to skip approval in `-p` mode),
  revisit live-mode automation. This revert is not permanent — it
  reflects today's tooling limits, not a permanent architectural
  choice.
