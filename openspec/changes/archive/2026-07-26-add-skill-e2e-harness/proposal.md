---
tags: [testing, e2e, ithy-opsx, dispatch, scaffold, harness]
execution: worktree
---

> **PARTIALLY REVERTED** by [revert-skill-e2e-live-mode](../../revert-skill-e2e-live-mode/): the live-Claude-CLI mode this proposal designed (Flows A–E dispatching real `claude -p '<slash>'` invocations, asserting per-skill semantic success signals like `agent/<id>` branches with `impl:` commits, `review.md` verdicts, phase transitions) proved unreliable — `claude -p` non-determinism and interactive commit-approval traps in `/ithy-opsx:apply` and `:archive` made the live-mode harness produce false positives / negatives across successive runs. The revert reshapes the harness to **structural coverage only** (does the scaffold land, do command files resolve, does the server boot) and moves live semantic verification to a manual procedure documented at `docs/skill-e2e-manual-verification.md`, keyed to Electron .app and VSCode extension paths. The structural coverage this proposal introduced (fixture scaffold + server lifecycle + skill-file resolution) is preserved intact — only the Claude-CLI-dispatch aspirations are removed.

## Why

`distribute-ithy-opsx-via-init-templates` (archived 2026-07-25) made
scaffold-via-Init the sole shipping path for `/ithy-opsx:*`. Every
prior `verify-dispatch-e2e-N` round (1 – 6, all completed) exercised
skill invocation against the dev repo's own `.claude/…` — never
against a scaffolded target. That leaves a load-bearing gap: no
existing test proves that a real consumer's project — where
`.claude/commands/ithy-opsx/*` and `.claude/skills/ithy-opsx-*/` were
copied out of `templates/` by `runInit()`, not present via the git
checkout — actually resolves and drives `/ithy-opsx:*` end-to-end.

The two sibling proposals close narrower parts of the same story:

- `add-init-scaffold-smoke-test` proves the files *land* in a
  scaffolded target (byte-identity assertion), plus the `npm pack`
  shape is correct.
- `add-bundle-verification-script` proves the packaged Electron / npm
  *bundle* ships the same files (post-electron-builder).

Neither proves that a Manager session running in a scaffolded target
can drive a full `/ithy-opsx:*` round-trip: dispatch a code worker,
receive a review verdict, verify, merge, archive, revert, import,
escalate, answer. That is exactly the "ithyno-tied" charter from
`redesign-skill-namespace-and-dispatch` — the commands only resolve
where scaffolded — asserted end-to-end for the first time.

This is Phase D of
[`docs/ideas/2026-07-26-comprehensive-skill-test-plan.md`](../../../docs/ideas/2026-07-26-comprehensive-skill-test-plan.md).
The idea-doc's Phase D table lists 11 skills that each want one
scaffolded-target round-trip: `apply`, `archive`, `merge`, `revert`,
`review`, `verify`, `dispatch`, `dispatch-multi`, `import`,
`escalate`, `answer`. This change delivers the harness that runs
those round-trips.

Secondary benefit: the harness is a **load-bearing consumer** of the
`add-init-scaffold-smoke-test` and `add-bundle-verification-script`
assertions. Those two catch "the file is missing"; this one catches
"the file is present but doesn't behave" — the resolution +
invocation + artifact contract chain that Init cannot verify by
inspection alone. A future regression that quietly reshapes the
`review.md` frontmatter contract, breaks `TARGET_PATH` computation,
or misroutes the agmsg branch would slip past the sibling tests and
surface here as a specific stage failing at the specific artifact
path.

## What Changes

### New: `scripts/skill-e2e.mjs`

A Node ESM harness (matching the shape of `scripts/release-build.mjs`
and `scripts/verify-bundle.mjs`) that:

1. Creates a `mkdtemp()` scaffolded target via `runInit()` imported
   from `bin/init.js`.
2. Boots an ithyno server on a random free port with that target as
   its cwd (subprocess spawn of `bin/ithyno` — the same entry point
   Electron / VSCode consumers spawn).
3. Walks the coverage matrix (see below), invoking each skill's
   command file and asserting the per-skill success signal.
4. Tears down the server + tmp target, prints a per-skill pass /
   fail summary, exits non-zero if any skill failed.

The harness is **gated behind `E2E=1`** — not wired into `npm test`.
Runtime is dominated by the ithyno server boot (~2s), the git
worktree operations per skill (~1s each), and one Claude Code round-
trip per dispatch flow (multi-second under a real CLI). Total
wall-clock target: under 3 minutes for the full matrix. Suitable for
pre-release verification and on-demand runs; not per-PR CI.

### Coverage matrix (representative subset, not exhaustive)

The idea-doc lists 11 skills × 3 phases × 2 execution modes = 66
permutations. That's not the goal. The goal is one round-trip per
skill that exercises the *resolution and artifact contract* in a
scaffolded target, using a small number of representative flows:

**Flow A — happy-path dispatch chain (worktree mode):**
`/ithy-opsx:apply` → `/ithy-opsx:review` → `/ithy-opsx:verify` →
`/ithy-opsx:merge` → `/ithy-opsx:archive`. Success signals per skill:

- `apply` — an `agent/<change-id>` branch exists with an
  `impl: <change-id>` commit.
- `review` — `review.md` written at the exact absolute
  `$REVIEW_MD_PATH` (worktree form) with a parseable `verdict:`
  frontmatter.
- `verify` — same shape, with a `pass` verdict after `npm test` /
  typecheck / build succeed in the scaffolded target (the harness
  seeds the target with a trivial one-file change that passes all
  three).
- `merge` — the merge commit is present on the target's default
  branch and the agent branch is optionally cleaned up.
- `archive` — the archive commit lands; the change moved from
  `openspec/changes/<id>/` to `openspec/changes/archive/<date>-<id>/`;
  the spec file was updated.

**Flow B — escalate + answer (needs-human path):**
seed a `needs-human` state, invoke `/ithy-opsx:escalate <id>
"<question>"` and then `/ithy-opsx:answer <id> "<answer>"`. Success
signals:

- `escalate` — phase transitions to `needs-human` via
  `POST /api/changes/<id>/needs-human`; `needs-human.md` artifact
  present.
- `answer` — phase transitions out of `needs-human` via
  `POST /api/changes/<id>/needs-human/answer`; artifact records the
  answer.

**Flow C — revert (`/ithy-opsx:revert`):**
seed a completed change in the scaffolded target, invoke
`/ithy-opsx:revert <scope>`. Success signals: a `revert-<scope>`
change directory exists with `proposal.md`, `design.md`,
`specs/<capability>/spec.md`, `tasks.md`; the target requirement
gained a PENDING annotation in the current spec; (Case α only) the
archived target gained a REVERTED annotation. `openspec validate
revert-<scope> --strict` passes.

**Flow D — import (`/ithy-opsx:import`):**
seed a target project with no `openspec/specs/`, invoke
`/ithy-opsx:import <target-path>`. Success signal: the target ends
up with a first-draft `openspec/specs/` set AND
`openspec/GENERATED.md` (the completion marker).

**Flow E — dispatch orchestrators (`/ithy-opsx:dispatch` and
`/ithy-opsx:dispatch-multi`):**
verified transitively by Flow A (which invokes dispatch through
each worker slash command). `dispatch-multi` gets one direct case:
seed two in-flight changes, invoke
`/ithy-opsx:dispatch-multi <id1> <id2>`, assert both changes'
phases advance concurrently (the `change:<id>` message routing
introduced by `add-multi-dispatch-orchestrator`).

Flows A – E cover all 11 skills. The matrix is deliberately narrow;
the harness is a smoke, not a fuzzer.

### New: fixture scaffolded-target generator

The harness cannot rely on a hand-crafted fixture (that would drift
against `templates/` and `bin/init.js` — the very things being
tested). Instead:

- A helper module `scripts/skill-e2e/fixture.mjs` (or an inline
  section inside `skill-e2e.mjs`) creates a fresh `mkdtemp()`
  directory, runs `runInit({ targetDir, autoGitInit: true, quiet:
  true })` against it, seeds an initial `git commit` so a default
  branch exists to merge into, and returns the target path plus a
  `cleanup()` handle. Reused across every flow — each flow gets a
  fresh scaffolded target so state does not leak between skills.
- Per-flow seeding (e.g., "an in-flight change with `phase: coded`"
  for Flow A's merge step, or "a completed change in the archive"
  for Flow C) happens on top of that base, via direct `git` /
  `openspec new change` invocations inside the target.

### New: `npm run e2e:skills` script

Root `package.json` `scripts` gains:

```json
"e2e:skills": "E2E=1 node scripts/skill-e2e.mjs"
```

Optional flag surface (documented inline in the script's `--help`):

- `--only <flow>` — run just Flow A / B / C / D / E (skip others).
- `--keep-tmp` — leave the scaffolded target on disk for
  post-mortem inspection.
- `--server-port <n>` — pin the ithyno server port (default:
  random free port).

Not wired into `npm test`, `npm run typecheck`, or any release step.
Invoked manually or by a maintainer's pre-release checklist. A future
change can add a nightly-CI job if the runtime and stability profile
prove out.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `dashboard`: extends the existing "Ithyno Init scaffolds
  `/ithy-opsx:*` into the target project" requirement with a
  scaffolded-target skill-e2e assertion. Not a new requirement; two
  ADDED scenarios under the existing one — the harness runs the full
  `/ithy-opsx:*` surface on a scaffolded target, and a regression
  that breaks any skill's resolution or artifact contract in that
  environment fails the harness.

## Impact

- **New script**: `scripts/skill-e2e.mjs` (~400 LoC estimate, plain
  ESM). Optional split into `scripts/skill-e2e/*.mjs` helpers if the
  size grows past ~600 LoC during impl.
- **Modified**: root `package.json` `scripts` — one new entry
  (`e2e:skills`). No new dev-dependencies expected: the harness uses
  `node:fs/promises`, `node:child_process`, `node:net` (random port),
  and the existing `runInit` import from `bin/init.js`.
- **No source code changes** to `bin/init.js`, `server/*`,
  `electron/`, or `.claude/`. This is a test / verification layer
  addition only.
- **No spec-level behavior change.** The invariants asserted are
  already promised by the distribute-ithy-opsx and dispatch
  requirements; this change adds e2e enforcement in a scaffolded
  target, not new contract.
- **Runtime cost**: the harness targets under 3 min wall-clock for
  the full matrix. Gated behind `E2E=1` so `npm test` runtime is
  unaffected.
- **Dependency on siblings**: `add-init-scaffold-smoke-test` and
  `add-bundle-verification-script` do NOT block this change — the
  harness can be implemented against the current `templates/` tree
  and `bin/ithyno` entry point regardless of whether those two have
  landed. The three together form the full Phase A + B + D coverage
  from the idea-doc; landing order is a scheduling choice, not a
  technical prerequisite.

### Non-goals

- **Replacing the manual `verify-dispatch-e2e-N` rounds.** Those
  exercise the dispatch orchestrator's *logic* on the dev repo
  (agmsg routing, MAX_REWORK_ROUNDS, semaphore, Manager fallback,
  etc.). This harness exercises the *packaged/scaffolded surface* —
  the outer shell of skill resolution and artifact contract, not the
  inner mechanics. Both coexist.
- **Exhaustive matrix.** 11 skills × 3 phases × 2 execution modes is
  66 permutations. The harness picks a representative subset (Flows
  A – E, above); it is a smoke, not a certification suite. Expanding
  the matrix is a future change if a specific permutation proves
  regression-prone.
- **Cross-OS coverage.** The harness runs on the host that invokes
  it. Windows / Linux extension is `add-windows-ci-matrix`'s scope,
  which can invoke this harness on those runners once landed.
- **Non-Claude worker CLIs.** The harness assumes the Manager and
  code worker are both Claude Code (the default `agents.yaml`
  template shape). Copilot / Antigravity / codex / gemini branches
  in the dispatch skill are exercised by the manual
  `verify-dispatch-e2e-N` rounds, not here.
- **VSCode extension entry point.** The idea-doc's Phase B lists a
  VSIX-driven "activate → newProject" test; that belongs in a
  separate change (`add-vsix-activation-smoke-test` or similar) and
  is out of scope here. This harness enters through the npm/CLI
  path.
- **The harness script itself is NOT delivered by this proposal.**
  Impl of `scripts/skill-e2e.mjs` follows this proposal; the tasks
  below name the sequencing.

## Success

- `E2E=1 node scripts/skill-e2e.mjs` — invoked at HEAD after impl —
  completes in under 3 minutes, prints a per-flow pass summary, and
  exits 0.
- A hypothetical regression that removes the `templates/.claude/skills/ithy-opsx-dispatch/`
  copy fails Flow A at the first `/ithy-opsx:apply` invocation with a
  clear "command not found" or "skill not resolved" message.
- A hypothetical regression that reshapes `review.md` frontmatter
  (e.g., renames `verdict:` to `result:`) fails Flow A at the
  `/ithy-opsx:review` step with a parseable-frontmatter error naming
  `$REVIEW_MD_PATH`.
- A hypothetical regression that breaks the `POST /api/changes/<id>/needs-human`
  endpoint fails Flow B at the `/ithy-opsx:escalate` step.
- `npm run e2e:skills` is documented in `CLAUDE.md`'s "Useful
  commands" section (impl adds this note).
