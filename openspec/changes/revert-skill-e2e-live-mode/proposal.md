---
tags: [revert, testing, e2e, ithy-opsx, harness, spec-tightening]
execution: worktree
---

## Why

`add-skill-e2e-harness` (archived 2026-07-26) shipped a live-Claude-CLI
harness that claimed to exercise every `/ithy-opsx:*` skill end-to-end
in a scaffolded target. Multiple live-mode iterations
(round 1 – round 7) surfaced structural bugs in the harness itself
(permission flags, ceilings, port hardcoding, worktree setup,
interactive-approval traps in `/ithy-opsx:apply` and `:archive`) that
we could iterate through, but the underlying `claude -p` mode behavior
is non-deterministic enough — same input, different result between
runs — that reliable live-mode CI is not achievable with today's
Claude Code CLI.

Rather than keep the live-mode aspirations in the spec and let them
drift further from reality, this revert reshapes the harness's spec to
match what actually ships: **structural coverage only** (does the
scaffold land, do command files resolve, does the server boot on
4321). Live semantic verification returns to the manual pattern used
by the historical `verify-dispatch-e2e-N` rounds — now documented
formally at `docs/skill-e2e-manual-verification.md`, keyed to Electron
and VSCode extension surfaces (the way real users actually invoke the
skills), not raw CLI.

## Targets

- `add-skill-e2e-harness` — Case α (archived at
  `openspec/changes/archive/2026-07-26-add-skill-e2e-harness/`).
  - Requirement modified: `Ithyno Init scaffolds /ithy-opsx:* into the
    target project` (partial revert — the harness paragraph and its
    live-mode scenarios are reshaped to structural coverage; the
    scaffold-reachability + package-shape scenarios landed by
    `add-init-scaffold-smoke-test` stay).
  - Not touched: any of the harness code that IS load-bearing
    (fixture generator, server boot lifecycle, structural assertions).

## What Changes

- **Spec — MODIFIED**: the "Ithyno Init scaffolds `/ithy-opsx:*`" requirement's
  harness paragraph is rewritten from "exercises every `/ithy-opsx:*`
  skill end-to-end" to "provides structural coverage" — the harness
  asserts scaffold landing + command-file resolution + server-boot on
  4321, not live Claude dispatch.
- **Spec — MODIFIED**: the "Skill-e2e harness runs every `/ithy-opsx:*`
  skill" scenario is rewritten to assert structural resolution (does
  every command file resolve? does the server boot?) instead of
  per-skill semantic success signals.
- **Spec — REMOVED**: the "artifact contract is broken" scenario —
  contract validation requires live Claude, out of scope for structural.
- **Spec — ADDED (structural rewrite)**: a scenario naming manual
  verification via `docs/skill-e2e-manual-verification.md` as the
  live-semantics coverage path.
- **Code**: `scripts/skill-e2e.mjs` and `scripts/skill-e2e/flows.mjs`
  stripped of live-mode branches (821 → ~200 LoC in flows.mjs).
  `scripts/skill-e2e/claude.mjs` deleted (no longer imported).
  `scripts/skill-e2e/fixture.mjs` retains `openspec init` step so the
  structural server can reach `/api/changes/:id/*` endpoints.
- **Docs (new)**: `docs/skill-e2e-manual-verification.md` — 11-skill
  manual checklist for both Electron .app and VSCode extension paths.
  Supersedes the CLI-based manual flow implied by
  `verify-dispatch-e2e-N`.

## Capabilities

### Modified Capabilities
- `dashboard`: the harness paragraph on the "Ithyno Init scaffolds
  `/ithy-opsx:*` into the target project" requirement is rewritten; two
  live-mode scenarios are dropped; one new scenario names the manual
  verification doc as live-semantics path.

## Impact

- **Tests removed**: none — live-mode paths that never reliably passed
  are removed but no green tests are lost. `E2E=1 npm run e2e:skills`
  now completes in ~15s with 11/11 structural PASS.
- **Docs added**: `docs/skill-e2e-manual-verification.md`. Replaces the
  ad-hoc CLI-run pattern with a documented Electron/VSCode-based
  procedure keyed to release cuts.
- **Runtime**: structural harness ~15s (was ~15min in live mode).
- **No source-code changes outside `scripts/skill-e2e/`.** Server,
  client, templates untouched.
- **No breaking API changes.** `npm run e2e:skills` still exists, still
  gated by `E2E=1`, still exits 0 / 1 / 2 the same way.
- **Follow-ups (not this change)**: none required. Live semantic
  verification is now explicitly manual; there is no automation gap to
  close.

## Non-goals

- **Does NOT remove the skill-e2e harness entirely.** Structural
  coverage is real value.
- **Does NOT change the `/ithy-opsx:*` skills themselves.** The
  interactive commit-approval steps in `/ithy-opsx:apply` and
  `:archive` remain by design — they belong in interactive user
  sessions, not `claude -p`.
- **Does NOT revert `add-init-scaffold-smoke-test` or
  `add-bundle-verification-script`.** Those catch different regression
  classes at the source-tree / bundle-shape layers.
