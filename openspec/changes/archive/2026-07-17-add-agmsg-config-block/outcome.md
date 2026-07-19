# Outcome — add-agmsg-config-block

P1 of the agmsg integration split. Landed a metadata-only `agmsg:` top-
level block on `agents.yaml`: parse + validate + expose. No runtime.

## ✅ Worked

- **Registry-owned surface, not WorkspaceState.** `parallelExecution`
  already lives on `AgentConfig` (registry) and rides `GET
  /api/agents/config` + the `agents-updated` WS broadcast — not on
  `WorkspaceState`. `agmsg` follows the same seam, so consumers don't
  need to figure out which state slice owns which agents.yaml field.
- **Round-trip preservation was free.** `applyAgentConfigPayload` in
  `config-writer.ts` already does `{ ...doc, agents: list }`, which
  spread-preserves unrelated top-level keys. Just needed a lock test
  (`preserves the top-level agmsg block through upsert`) — no code
  change to the writer.
- **Validator symmetry.** `validateAgmsg` throws the same way
  `validateParallelExecution` throws; the loader catches and stamps the
  cache with `ok: false + error`, and the existing agents-config error
  banner surfaces the message with zero UI wiring.
- **Test coverage came out clean** — 6 registry cases (absent, team-
  only, team+storage, missing team, empty team, non-string storage) +
  1 config-writer round-trip.

## ⚠️ Surprises

- **tasks.md 2.1/2.2 initially planned to put agmsg on `WorkspaceState`.**
  Once I looked at how `parallelExecution` was actually wired, that was
  clearly wrong: openspec/-derived state stays on `WorkspaceState`,
  agents.yaml-derived state stays on `AgentConfig`. Rewrote section 2
  of tasks.md and adjusted the spec delta ("mirrored via `agents-
  updated` WS event" replaced "exposed via `WorkspaceState.agmsg`").
- **The spec's "state.agmsg" phrasing had to be scrubbed** across three
  scenarios. Easy fix but a reminder that the propose stage's mental
  model can leak into scenario language — worth a Grep before validate.

## 🔁 Differently next time

- **Verify the state-ownership pattern before writing tasks.md.** For
  any agents.yaml addition, the answer is "AgentConfig, not
  WorkspaceState." Encoding that as a rule would have skipped the
  tasks.md rewrite.
- **Skip WorkspaceState.agmsg from the propose entirely** — the spec
  delta shouldn't mention state slices the propose isn't going to
  touch. Keep it at the API surface (`GET /api/agents/config` + WS
  event) and let scoping decisions land on the impl side.

## 🌱 Follow-ups

- **P2 `route-live-shell-to-tmux-agmsg`** — the actual runtime work:
  PTY spawns `tmux new-session -A -s ithyno`, manager bootstrap loads
  agmsg, dispatcher routes live-shell workers via `agmsg send`. The
  metadata surface landed here is the config-side of that change.
- **P3 `bundle-agmsg-in-electron`** — vendor agmsg shell scripts under
  `extraResources` so the desktop distribution doesn't require a
  system-wide agmsg install. Tmux stays system-provided; Windows path
  is a later concern.
- **UI surfacing** — Agents tab could badge "agmsg: team=<name>" once
  a consumer actually reads `state.agmsg`. Deferred to P2 (nothing to
  say until the runtime piece exists).
- **`agents.yaml.example` update** — deferred to P2 for the same reason.
