---
tags: [feature/workflow, feature/escalation, screen/kanban, area/server, area/web]
---

## Why

Phase 3+ puts agents at every workflow gate, and agents will hit
questions they cannot resolve: a proposal missing context only the
human has, a review disagreement, an archive-time spec conflict. The
phase-gates idea note (`docs/ideas/2026-07-04-phase-gates-and-putback.md`)
concludes every gate needs an escape hatch. Without a first-class
escalation channel, blocked changes silently stall inside whatever
lane they occupy and the human never notices.

This change adds `needs-human` as a **phase-agnostic** escalation
state on top of the phase machine landed by
`add-phase-state-machine`. It is deliberately not a linear step: a
change escalates *from* any phase and returns *to* that phase when
answered. In Phase 2 only the user triggers escalations (via the UI)
or writes the artifact by hand; agent-written escalations arrive
with the gate agents in later phases — but the artifact format,
API, and lane they will use land now.

**Sequencing note**: this is the second change of Phase 2. It
depends on `add-phase-state-machine` being merged first — sidecar
module, `Phase` type, and lane renderer are extended here, not
introduced. Do NOT implement in a parallel worktree with the state-
machine change; both touch `server/index.ts`, `server/sidecar.ts`,
`web/src/store.ts`, and `web/src/components/Kanban.tsx`.

## What Changes

- **Model.** The sidecar and `Change` payload gain `priorPhase`
  (populated only while `phase === "needs-human"`) and `escalatedAt`
  (ISO timestamp, used for wait-time sorting that survives restart).
  `needs-human` joins the phase values accepted by persistence but
  is excluded from the linear `PHASES` lane order — it gets its own
  dedicated lane.
- **Artifact.** Escalations are captured in
  `openspec/changes/<id>/needs-human.md`, a human-readable document
  (not JSON): a mandatory H1 stating the single question, an
  optional `## Context` section, an `## Answer` section appended
  when answered, and a mandatory footer line `answered: false`
  flipped to `answered: true` on resolution.
- **Escalation API.** CSRF-guarded
  `POST /api/changes/:id/needs-human` with body
  `{ question, context? }`: writes `needs-human.md`, records
  `priorPhase` (the change's current phase; defaults to `proposed`
  if the change is unphased) and `escalatedAt` in the sidecar,
  sets `phase: needs-human`, and broadcasts `state-updated`.
  Escalating an already-escalated change is rejected with 409.
- **Answer API.** CSRF-guarded
  `POST /api/changes/:id/needs-human/answer` with body `{ answer }`:
  appends the answer under `## Answer`, flips the footer to
  `answered: true`, restores `phase` to `priorPhase`, clears
  `priorPhase`/`escalatedAt`, and broadcasts.
- **Editor fallback.** The chokidar watcher parses `needs-human.md`
  on change; if the footer reads `answered: true` while the change
  is still in `needs-human`, the server performs the same restore.
  The restore path is **guarded by `phase === "needs-human"` check**
  before reading, so a duplicate chokidar fire (or a manual
  re-save) doesn't attempt to restore twice. Humans who prefer
  their editor never need the modal.
- **Kanban.** A dedicated `needs-human` lane, visually distinct and
  **always rendered even when empty** so its emptiness is
  glanceable good news. Cards in it are sorted by wait time
  (oldest `escalatedAt` first) and show the question plus a
  waiting-duration badge. Cards in this lane cannot be dragged to
  other lanes — answering is the only exit — to keep the artifact
  and phase in lockstep.
- **Escalation UX.** Every card in every phase lane (and the
  Unphased section) gains an "Escalate" action (in the Phase ▸
  menu) opening a modal where the user types the question and
  optional context; submit POSTs the escalation API. Clicking an
  escalated card opens an answer modal showing question + context
  with an answer textarea; submit POSTs the answer API and the
  card animates back to its prior lane.

## Capabilities

### Modified Capabilities

- `dashboard`: adds the phase-agnostic `needs-human` escalation
  state, the `needs-human.md` artifact schema, escalation and
  answer APIs, the dedicated Kanban lane, and the escalation UX.

## Impact

- `server/needs-human.ts` (new) — artifact read / write / parse
- `server/sidecar.ts` — `priorPhase`, `escalatedAt` fields
  (extends the module added by `add-phase-state-machine`)
- `server/index.ts` — two routes + chokidar hook on
  `needs-human.md` + question / escalatedAt in `GET /api/state`
- `web/src/store.ts` — `priorPhase?: Phase`, `escalatedAt?: string`,
  parsed question for card display
- `web/src/components/Kanban.tsx` — `needs-human` lane rendering,
  wait-time sorting, dnd guards
- `web/src/components/ChangeCard.tsx` (or equivalent) — Escalate
  menu item, question badge, wait duration
- Two new modal components — escalation and answer

## Out of scope

- **Agent-initiated escalations.** No gate agents exist yet — but
  nothing in the artifact or API assumes a human author, by
  design. Phase 3+ will call the same API from an agent.
- **Multi-question threads.** One open escalation per change.
  Re-escalation after answering creates a fresh `needs-human.md`
  (previous content is superseded; git history preserves it).
- **Notification integrations** (sound, badge count, external
  ping). Follow-up once wait times are observable.
- **Worktree-branch interaction.** Escalation via the dashboard
  writes `needs-human.md` on the branch the server is checked out
  on (typically main). An agent running in a `.worktrees/pool-N/`
  or `.worktrees/<change-id>/` branch will not see this file
  until its branch is merged. Deferred; the same limitation
  documented for `add-phase-state-machine`.
- **`openspec archive` handling.** A change whose answered
  `needs-human.md` sits in its dir gets archived along with the
  rest of the change dir (moves to
  `openspec/changes/archive/<id>/needs-human.md`). Nothing extra
  to implement — this is the natural fall-out of the artifact
  layout and is captured as a scenario.
