---
status: idea
tags: [feature/agents, feature/worktree, area/server, area/web, area/skills]
source: conversation
related:
  - openspec/changes/archive/2026-07-04-add-worktree-external-discard-detection/proposal.md
  - openspec/changes/archive/2026-07-04-add-kanban-orphaned-archive-action/proposal.md
  - openspec/changes/archive/2026-07-04-revert-agent-pty-layers/proposal.md
promoted_to: null
---

# Agent roles + worktree pool

Move beyond the current "one Claude agent per change, one worktree per
change, everything lives in the worktree forever" model. Introduce
role-typed agents (reviewer / coder / argument / …), a bounded
worktree pool that gets reused across changes, and per-role
concurrency caps. Optional specialty routing by tags. This is a
substantial architecture note — the eventual work will land as a
sequence of proposals; this note captures the shape.

## Motivation

**Current pain points observed in this session:**

- Every `Start` on a Kanban card creates a new `.worktrees/<change-id>`
  directory. Long sessions accumulate dozens; users manually
  `git worktree remove` them (see `add-worktree-external-discard-
  detection`).
- Every agent is the same `claude` entry from `agents.yaml`, running
  the same `/ithy-opsx:apply` prompt. No specialization — the coder
  who wrote the diff is the same "agent" that would review it,
  which defeats the review's purpose.
- No queueing or concurrency limits — if the user Starts five changes
  simultaneously, five agents run in parallel, competing for the
  same terminal / disk / API quota.
- No handoff between phases: a proposal that could benefit from
  adversarial review before implementation just gets implemented
  directly.

**The desired shape:**

- Multiple agent definitions, each with a **role** (`coder`,
  `reviewer`, `argument`, …) and optional **specialties** (tag
  filters).
- Per-agent **concurrency cap** so a single role can't
  saturate the queue.
- **Worktree pool** with a fixed size; worktrees are reused across
  changes rather than dedicated 1:1.
- **Dispatcher** that picks the right agent + worktree when a
  phase transition demands work.
- **Phase state machine** on each change: `proposed → coded →
  reviewed → done`, with loops for review-fail-return-to-coder.

## Proposed shape

### 1. Agent registry (`agents.yaml` schema extension)

```yaml
agents:
  - name: coder-web
    role: coder
    specialties: [area/web, feature/ui]
    command: claude
    initialInputTemplate: "/ithy-opsx:apply ${change_id}"
    concurrency: 2

  - name: coder-server
    role: coder
    specialties: [area/server]
    command: claude
    initialInputTemplate: "/ithy-opsx:apply ${change_id}"
    concurrency: 2

  - name: reviewer
    role: reviewer
    specialties: []           # empty = accepts everything
    command: claude
    initialInputTemplate: "review the diff for ${change_id}"
    concurrency: 1

  - name: arguer
    role: argument
    specialties: []
    command: claude
    initialInputTemplate: "challenge ${change_id}'s proposal.md"
    concurrency: 1
```

New fields (backwards-incompatible schema change; existing
`agents.yaml` needs migration):

- `role: coder | reviewer | argument | proposer` (open set, extensible)
- `specialties: string[]` — tag prefixes; empty = accepts any tag
- `concurrency: number` — cap on simultaneous jobs for THIS agent

The old `initialInput` field becomes `initialInputTemplate` with the
same `${change_id}` variable substitution semantics.

### 2. Worktree pool config

```yaml
worktreePool:
  max: 5                        # hard cap on `.worktrees/pool-N/`
  namePrefix: pool              # `.worktrees/pool-1/`, `.worktrees/pool-2/`, …
  cleanupBetweenJobs: git-clean # `git-clean` | `reset-to-main` | `recreate`
  idleReleaseAfter: 300         # seconds — pool worktree removed if unused
```

Semantics:

- Pool worktrees are named `pool-1` … `pool-N`, not by change id.
- On job start, the dispatcher acquires an available worktree from
  the pool (or queues if all are busy).
- On job end, the worktree is cleaned (per `cleanupBetweenJobs`)
  and returned to the pool.
- The change id is stored as metadata on the worktree (per-job
  meta file); the pool doesn't carry it in the path.

### 3. Dispatcher (new server component)

Responsibilities:

- Maintain the running-jobs registry (already exists in
  `AgentRunner`).
- Maintain the worktree pool (new).
- On a work request (change + phase):
  1. Filter agents by role (`phase` → `role`).
  2. Filter by `specialties` intersecting the change's tags.
  3. Pick the agent with capacity (running < concurrency).
  4. Acquire a worktree from the pool (or queue).
  5. Spawn the agent, wait, release worktree on completion.
- Handle handoffs: on job success, advance the change's phase and
  re-dispatch (or, for interactive flows, notify the UI to await
  human approval).

Data structures (sketch):

```
type PhaseName = 'proposed' | 'coded' | 'reviewed' | 'done'
type Agent = {
  name: string, role: string, specialties: string[],
  concurrency: number, running: number
}
type WorktreeSlot = { name: string, path: string, busyWith: string | null }
type WorkItem = { changeId: string, phase: PhaseName, submittedAt: number }

queue: WorkItem[]           # FIFO, or scheduled by tag / priority
runningJobs: Map<jobId, {...}>
pool: WorktreeSlot[]
```

### 4. Phase state machine per change

Change stores a `phase` field (in memory or `proposal.md`
frontmatter):

```
proposed → argued (optional) → coded → reviewed → done
                                  ↑          ↓ (rejected)
                                  └──────────┘
```

Transitions:

- `proposed`: propose committed, waiting for coder OR argument
  agent
- `argued`: argument agent finished, human decides next step
- `coded`: coder finished, waiting for reviewer
- `reviewed`: reviewer approved, ready for archive
- `rejected`: reviewer objected, back to coder with review comments

Each transition can be automatic (dispatcher picks next agent) or
gated (user clicks a button in UI). Configurable per-phase.

### 5. UI implications

**Kanban** — introduce swim lanes by phase, or keep columns and add
a phase badge on each card. Prefer swim lanes: the mental model of
"where does this change live in the pipeline" becomes visual.

**Agents page** — currently a job list. Rework as:

- **Roster panel**: per-role running / queued count, pool
  utilization heatmap.
- **Job list**: filterable by role, by change, by phase.
- **Queue**: pending work, oldest first.

**ChangeDetail** — show the change's current phase, the assigned
agent (if any), and the phase history (who did what, when).

## Open questions

Points that need decision before formal proposal:

- **Handoff automation vs. human gate**: reviewer approves → auto-
  archive? Or hold at "reviewed" until human clicks Archive? Probably
  configurable per-project or per-change.
- **Argument agent's position**: pre-code (challenge the proposal
  before writing any code) or post-code (challenge the impl)?
  Different value; possibly both, with two argument-role variants.
- **Pool vs. dedicated worktrees**: some long-running work might
  want a dedicated worktree that persists across phases; pool suits
  short, per-phase runs. Maybe a `dedicated: true` flag on agents,
  or a per-change opt-in.
- **Specialty matching algorithm**: exact prefix, substring,
  scoring? "Coder-web" with `specialties: [area/web]` vs. a
  change with `tags: [area/web, area/server]` — match or pick the
  server specialist? Likely: highest overlap wins, ties broken by
  concurrency capacity.
- **Cross-agent context sharing**: reviewer needs to see the coder's
  output. Just the diff? Or the whole transcript (long, expensive)?
  Probably the diff + change's proposal.md/design.md; transcripts
  stay per-agent.
- **Retry / re-assignment on crash**: coder crashes mid-run — does
  another coder pick it up automatically, or does the user have to
  re-Start? Retry once, then flag for human review.
- **Backward compat**: existing `agents.yaml` entries without `role`
  need a default (`coder`?) and a warning; existing `.worktrees/
  <change-id>` directories need a migration story (probably: leave
  alone, don't retroactively pool).

## Sequencing (once idea graduates)

Landing this in one giant change is a bad idea. Split into a chain:

1. **`add-agent-role-field`** — schema extension only, `role` +
   `specialties` + `concurrency` fields added, dispatcher NOT
   introduced, current single-agent behavior preserved via a
   default `role: coder`. Non-breaking migration.
2. **`add-worktree-pool`** — pool manager, `.worktrees/pool-N/`
   creation, idle release. Existing `.worktrees/<change-id>` path
   still supported via a per-agent `dedicated: true` flag.
3. **`add-agent-dispatcher`** — introduces role-based routing,
   specialty matching, queueing. Optional per-project.
4. **`add-phase-state-machine`** — change carries a phase field,
   transitions on job completion, UI shows phase.
5. **UI overhaul** — Kanban swim lanes, roster panel, phase view.
   Land last so users have the underlying capabilities to interact
   with.

Each step is independently useful; even step 1 alone (role tags)
gives users better organization of `agents.yaml`.

## Related prior work

- `add-agent-runner` (archived) — the original per-change runner
  this note extends
- `add-agent-process-detach` (still in-flight!) — detached agents
  for long runs; relevant to pool release semantics
- `add-worktree-external-discard-detection` (archived) — pool
  cleanup borrows this change's watcher pattern
- `add-agent-lifecycle-narration` (unproposed) — narration lines
  during phase transitions would benefit
- `docs/ideas/2026-06-24-task-assignment.md` (probable predecessor,
  if it exists — worth checking) — earlier thinking about who
  works on what

## Status

Idea. Not shaped enough for a formal proposal yet — the "open
questions" above need answers first, ideally from at least one
dogfooding session where we mock up a two-agent handoff (coder →
reviewer) manually and see what UX friction shows up. Promote to
`shaped` after that dry run.
