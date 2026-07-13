---
status: idea
tags: [feature/agents, feature/workflow, area/server, area/web]
source: conversation
related:
  - docs/ideas/2026-07-04-agent-roles-and-worktree-pool.md
  - openspec/changes/tighten-archive-verify-in-worktree/proposal.md
promoted_to: null
---

# Phase gates + putback (multi-checkpoint review flow)

The [agent roles + worktree pool](./2026-07-04-agent-roles-and-worktree-pool.md)
idea sketches a phase machine `proposed → coded → reviewed → done` with
one review gate (`coded → reviewed`) and one putback path (rejection →
`review.md` → re-code). This idea argues **that's too thin**. The
existing OpenSpec workflow already implies multiple gates; the phase
machine should surface all of them with per-gate review + putback,
each with the right destination.

## Motivation

**Weak proposals get coded, then rejected.** With only a post-code
review, a proposal with vague acceptance criteria, missing spec
scenarios, or an incoherent design.md doesn't get caught until after
the coder wrote (and possibly committed) code. Rework is expensive
and the wrong artifact gets edited — reviewer flags issues rooted in
the proposal, but re-dispatched coder can only edit code.

**Archive-time surprises.** Even a code-approved change can fail at
archive:

- `openspec validate --all` breaks because the change's spec delta
  conflicts with a spec that changed while the review was pending.
- `outcome.md` is empty or reads as "did the thing" (no learning).
- `tighten-archive-verify-in-worktree` verify tasks are unchecked.
- Post-merge tests fail on main.

The current model treats archive as "just do it after review approves,"
which hides these failures until the last moment and requires ad-hoc
recovery.

**Not all putback destinations are the same.** Post-code rejection
goes back to the coder. Proposal-level issues need to go back to the
proposal author (human or a `proposer` agent). Archive-time failures
branch: spec conflict → proposal, test failure → code, outcome
weakness → outcome step alone. Modeling putback as "always back to
coder" collapses distinctions that matter for who fixes what.

## Proposed shape

### 1. Expanded phase machine

```
proposed → validated → coded → reviewed → verified → done
             │            │        │          │
             │(putback:    │(review │(putback: │(putback:
             │ revise      │ = tests│ review.md│ branch by cause
             │ proposal)   │ + agent│→ re-code)│ ↳ spec conflict
             │             │ review)│          │   → proposal
             │             │        │          │ ↳ tests fail
             │             │        │          │   → code
             │             │        │          │ ↳ outcome weak
             │             │        │          │   → outcome step
             └─ pre-code   ─┴───────┴──────────┘
                review (proposal quality)
                different putback destination!
```

Any gate may also short-circuit to `needs-human` when an agent can't
resolve the finding (see §3).

### 2. Three gates in detail

**Gate A — `proposed → validated` (pre-code review)**

- Mechanical: `openspec validate <id>` must be VALID.
- Agent (new role `critic`, previously deferred): reads
  `proposal.md`, `design.md`, spec deltas, and `tasks.md`. Judges:
  are the acceptance criteria testable? Do scenarios cover the
  change's stated scope? Is the design.md consistent with the
  spec deltas? Are tasks decomposed enough to hand to a coder?
- Putback: `openspec/changes/<id>/proposal-review.md` written with
  objections. Phase reverts to a `revision-requested` state. The
  proposal author (human or `proposer` agent, if introduced later)
  edits `proposal.md` / `design.md` / `tasks.md` and re-submits.
- The coder never sees `proposal-review.md`; it's a proposal-layer
  artifact.

**Gate B — `coded → reviewed` (post-code review, current design)**

- Mechanical: `npm test && npm run typecheck && npm run build`.
- Agent (`reviewer` role): reads the diff, the proposal, the specs;
  judges "does the code do what the proposal says?"
- Putback: `openspec/changes/<id>/review.md`. Re-dispatch coder
  with `--review` flag pointing at it.
- Bounded by `maxReviewCycles: 2` (see agent-roles idea §3).

**Gate C — `reviewed → verified` (pre-archive gate)**

- Mechanical:
  - `openspec validate --all` (catches delta collisions with other
    changes that landed during review).
  - `tighten-archive-verify-in-worktree` verify tasks all checked.
  - Post-merge dry-run: does main + this change still pass tests?
- Agent (thin — `archive-verifier` role or just a script): reads
  `outcome.md` for completeness (all four suggested sections
  populated, not just placeholders).
- Putback branches by cause:
  - Spec conflict → back to `proposed` (proposal-author revises delta).
  - Tests fail → back to `coded` (coder fixes).
  - Outcome weak → stays in `verified`, `outcome.md` step alone
    re-runs (no full re-code needed).
- Archive-verifier is mostly mechanical; the agent portion is
  small enough it may collapse into the reviewer role with a
  different prompt template. Decide during proposal shaping.

### 3. `needs-human` — the phase-agnostic escape hatch

Every gate must be able to escalate. Agents will hit ambiguity they
can't resolve: proposal missing context only the human has, review
disagreement between reviewer's read and coder's intent,
archive-time spec conflict that needs a human call on which delta
wins.

- Any agent at any gate may write `needs-human.md` (or a
  structured JSON in `openspec/changes/<id>/`) with a single
  question and the context needed to answer.
- Phase transitions to `needs-human` (an orthogonal phase, not a
  linear step).
- Kanban surfaces this prominently — dedicated `needs-human`
  swim lane, sorted by wait time.
- Human answers via the UI; the change returns to the phase it
  came from, with the answer appended to the relevant artifact
  (`review.md` if it was a review-time question, etc.).

### 4. Alignment with existing OpenSpec workflow

The phase field is a **projection** of artifact state, not a new
source of truth:

| Existing artifact / step | Phase reached | Who advances it |
|---|---|---|
| `openspec validate <id>` VALID + `proposal-review.md` clean | `validated` | mechanical + `critic` agent |
| Tasks.md all ticked + agent branch has commits | `coded` | `coder` agent (via `/ithy-opsx:apply`) |
| `review.md` absent (or approved) + tests pass | `reviewed` | `reviewer` agent |
| `outcome.md` populated + verify tasks checked + `validate --all` clean | `verified` | `archive-verifier` (or scripted) |
| `openspec archive <id>` executed | `done` | `/ithy-opsx:archive` skill |

**Key alignment principle**: dispatcher invokes existing skills
(`/ithy-opsx:apply`, `/ithy-opsx:archive`, `openspec validate`),
not custom code paths. The skill layer is stable; the phase
machine is orchestration over it.

## Open questions

- **Where does `revision-requested` live in the state machine?**
  A distinct phase, or a flag on `proposed` that says "reopened
  by critic"? Distinct is cleaner for UI (swim lane count),
  flag is cheaper to model.
- **Critic vs. reviewer overlap.** Both are LLM agents reading
  artifacts. Are they distinct agents with different prompts,
  or the same agent with a `mode` parameter? Distinct is more
  observable (separate knowledge files, separate rejection
  histories); same-agent-two-prompts is cheaper.
- **Archive-verifier: agent or script?** If it's mostly
  mechanical (`validate --all`, verify checkboxes, outcome
  populated), a script suffices and no new agent role is
  needed. Only the "is outcome.md meaningful?" judgment might
  need an LLM. Lean toward script + optional agent judgment.
- **Does `type/docs` skip Gate B?** Documentation-only changes
  might not need code review. Same for `type/refactor` (well-
  covered by tests) — but that's dangerous. Configurable per-
  `type/*` rather than hard-coded.
- **Retry semantics per gate.** Post-code reviewer rejection is
  bounded by `maxReviewCycles: 2`. Should the same bound apply
  to critic → proposal-author cycles? Probably yes, with escape
  to `needs-human` on exceed.
- **Batch vs. per-change gate policy.** In this repo the user
  often runs several changes in one session; each gate adds
  overhead. Is there a per-project setting to disable Gate A
  (trust proposals) or Gate C (trust archive) for velocity?

## Sequencing implications

The [agent-roles idea's Sequencing](./2026-07-04-agent-roles-and-worktree-pool.md)
had `add-review-artifact` as one step. Under this idea it splits:

1. **`add-proposal-review-gate`** (new) — introduces Gate A:
   `critic` role, `proposal-review.md` artifact, `validated`
   phase, `revision-requested` state.
2. **`add-code-review-gate`** (was `add-review-artifact`) —
   Gate B: `review.md`, `reviewer` role, `--review` re-dispatch
   template.
3. **`add-archive-verify-gate`** (new) — Gate C: mechanical
   checks (`validate --all`, verify checkboxes, outcome
   populated), `verified` phase, branched putback.
4. **`add-needs-human-phase`** (new) — phase-agnostic escape,
   Kanban swim lane, UI answering form. Should land alongside or
   BEFORE Gate A so users have a way out from the start.

Order matters: `needs-human` first (safety net), then Gates in
order B → A → C (B is what the agent-roles idea already had; A
adds the pre-code cost/benefit trade; C is easiest to script and
can land last). But there's a case for A first if weak proposals
are the current biggest source of rework.

## Related prior work

- [`add-proposer-critique-checkpoint`](../openspec/changes/archive)
  (probably archived if it exists — worth checking) — earlier
  attempt at pre-code review
- `tighten-archive-verify-in-worktree` — the archive-verify gate
  this idea generalizes into Gate C
- `add-review-artifact` (planned in agent-roles sequencing) —
  becomes `add-code-review-gate` under this framing

## Status

Idea. Depends on the agent-roles idea reaching `shaped` — the
concepts of `coder` / `reviewer` / dispatcher / phase field must
exist first. Then this idea's expansion (more gates, more
putback destinations, `critic` role, `needs-human` phase) layers
on top. Do NOT graduate to a proposal until agent-roles has
graduated and at least one gate (B) has shipped and been used
in anger — evidence that the current thin model is insufficient.
