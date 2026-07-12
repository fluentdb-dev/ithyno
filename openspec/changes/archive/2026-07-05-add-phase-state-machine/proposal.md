---
tags: [feature/workflow, feature/kanban, screen/kanban, area/server, area/web]
---

> **PARTIALLY REVERTED** by [revert-kanban-ui-lanes](../2026-07-12-revert-kanban-ui-lanes/) —
> Kanban UI portion: `Kanban Phase Swim Lanes` と `Legacy Fallback For Unphased Changes` は
> 「看板 = 3 列のみ」原則により removed。Server-side (`Phase Persistence In Change Sidecar`,
> `Phase Transition API`) は Manager / worker が使うのでそのまま。
> `Manual Phase Transitions In The UI` は先行 [revert-active-phase-ui](../2026-07-07-revert-active-phase-ui/) で削除済み。

## Why

The multi-agent redesign (Phase 3+) needs a shared notion of where each
change sits in the pipeline before any automation can drive it. Today the
Kanban infers three coarse columns (todo / inprogress / done) from job
state and task progress inside `bucketize()`. That inference cannot
express the workflow stages the roadmap defines
(`proposed → coded → reviewed → done`), cannot be overridden by the user,
and does not survive a restart as anything other than a re-derivation.

This change lands the observability substrate: an explicit, persisted
`phase` field per change, surfaced as swim lanes on the Kanban.
Transitions are **manual only** — the user drags a card between lanes
or picks a phase from a per-card menu. No auto-advance from job
completion or artifact state ships here; dispatcher-driven transitions
are Phase 3, and the intermediate `validated` / `verified` gates from
the phase-gates idea note are Phase 4. The enum values `validated` and
`verified` are reserved (rejected by the API with a clear error) but
never rendered as lanes.

**Sequencing note**: this is Phase 2 of the multi-agent redesign,
sequel to Phase 1 (`add-agent-role-field` + `add-worktree-pool`). It
ships alongside `add-needs-human-phase`; both touch
`server/index.ts`, `server/sidecar.ts` (new), `web/src/store.ts`, and
`web/src/components/Kanban.tsx`, so they cannot be implemented in
parallel worktrees — implement this change first and rebase
`add-needs-human-phase` onto the merged result.

## What Changes

- **Model.** `Change` gains an optional `phase` field with values
  `proposed | coded | reviewed | done` (plus `needs-human`, populated
  only by the companion change `add-needs-human-phase`). A shared
  `const PHASES = ["proposed", "coded", "reviewed", "done"] as const`
  lives in a module imported by both server and `web/src/store.ts`.
- **Persistence.** Phase is stored in the existing per-change sidecar
  `openspec/changes/<id>/.openspec.yaml` under a `phase:` key.
  Rationale: the sidecar is already machine-owned mutable state, so
  writes never touch the human-authored `proposal.md`, never risk
  mangling its frontmatter, and keep proposal diffs reviewable. Absent
  key = unphased (backwards compat). Manual overrides therefore
  survive server restart.
- **Server API.** `GET /api/changes/:id/phase` returns the current
  phase (or `null`). `POST /api/changes/:id/phase` with body
  `{ phase: "coded" }` validates against the enum, rejects reserved
  values (`validated`, `verified`) with a 400 message that names the
  reserved value and points at
  `docs/ideas/2026-07-04-phase-gates-and-putback.md`, rejects unknown
  strings with 400, and writes the sidecar. The POST is guarded by the
  existing `requireCsrfBase` middleware, matching
  `POST /api/changes/:id/tasks/toggle`.
- **WS broadcast.** Successful phase writes reuse the existing
  `state-updated` broadcast. No new `ServerEvent` variant is added —
  the full-state event already carries the updated phase.
- **Kanban.** The 3-column layout is replaced by four phase swim
  lanes (`proposed`, `coded`, `reviewed`, `done`) rendered in pipeline
  order. Changes **without** a phase render in a collapsed "Unphased"
  section at the bottom that reuses the existing `bucketize()`
  todo / inprogress / done grouping unchanged — no behavior change for
  pre-existing changes until the user opts a card in.
- **Transitions UX.** Primary: drag a card between lanes via the
  existing `@dnd-kit/core` wiring; drop fires the phase POST.
  Secondary (accessibility/discovery): each `ChangeCard` gains a
  "Phase ▸" menu listing all four phases; selecting one fires the
  same POST. Dragging an unphased card into a phase lane adopts that
  phase (first sidecar write). Transitions are unrestricted in
  direction — the user is the state machine in Phase 2.
- **Client hardening.** The client narrows the phase string against
  `PHASES`; an unknown value (e.g. a future `validated` written by
  hand) renders the card in the Unphased section rather than
  crashing or inventing a lane.

## Capabilities

### Modified Capabilities

- `dashboard`: adds phase persistence, phase API, Kanban swim lanes,
  manual transitions, and a legacy fallback for pre-phase changes.

## Impact

- `server/sidecar.ts` (new) — `readSidecar()` / `writeSidecar()` for
  `openspec/changes/<id>/.openspec.yaml`, preserving unrelated keys
- `server/phases.ts` (new, shared with web) — `PHASES` const + `Phase`
  type + reserved-values guard
- `server/index.ts` — GET/POST phase routes, chokidar watch on
  `.openspec.yaml`, phase in state-updated payload
- `web/src/store.ts` — `phase?: Phase` on `Change`, import shared
  `PHASES`
- `web/src/components/Kanban.tsx` — swim lanes + fallback section +
  drag targets per lane
- `web/src/components/ChangeCard.tsx` (or wherever the card component
  lives) — Phase ▸ menu

## Out of scope

- **Automatic phase computation** from artifact state (validate output,
  task ticks, outcome.md). The idea note's "phase is a projection"
  model is what Phase 3/4 automation implements; Phase 2 is
  explicit-only by design.
- **`validated` / `verified`** lanes or gate agents (Phase 4).
- **`needs-human`** behavior — that is `add-needs-human-phase`, which
  builds on this change's sidecar module, phase enum, and lane
  renderer.
- **Start / Merge / Discard / Archive** button logic on cards —
  untouched.
- **Atomic sidecar writes** (rename-based). Phase 2 is single-user
  local so `writeFileSync` is fine; a proper `write-tmp-and-rename`
  path is a candidate follow-up if multi-writer scenarios appear.
- **Worktree-branch interaction**: a phase transition writes the
  sidecar on the branch the server is checked out on (typically
  `main`). Interaction with an agent's in-flight worktree branch that
  has a divergent copy of the change dir is deferred to a follow-up.
