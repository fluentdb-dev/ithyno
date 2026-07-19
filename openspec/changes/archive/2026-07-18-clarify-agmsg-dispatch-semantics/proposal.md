---
tags: [feature/agents, feature/messaging, area/skills, agmsg, docs]
---

# Clarify live-shell semantics and Copilot iteration limits

## Why

Two spec-level gaps surfaced during the `verify-dispatch-e2e` run
and its follow-ups:

1. **`Agent Mode Field` still describes worker `live-shell` as
   "headless child with stdio pipe" for aider-style CLIs.** That
   was the pre-agmsg placeholder. Post P2b/c + `signal-stage-
   completion-via-agmsg-message`, worker `live-shell` in an
   agmsg-configured workspace actually means "agmsg-routed peer
   spawned in an adjacent tmux pane with a message-based
   completion contract". The current text is misleading and hints
   at behavior the runner no longer implements.

2. **`Dispatch Slash Command` does not name Copilot's iteration
   limit.** Copilot's CLI has no Monitor-tool equivalent, so a
   Manager can never send a mid-iteration prompt to an existing
   copilot worker. Iteration for copilot workers is always
   "fresh spawn per iteration". The spec should say so, so future
   contributors don't design skills that assume send-based
   iteration works for every agmsg type.

This change is documentation only — no code, no skill body edits,
no behavior change.

## What Changes

### 1. `Agent Mode Field` — rewrite worker `live-shell` definition

Replace the "stdio: [pipe, pipe, pipe] + stdin-piped for aider-
like CLIs" text with the agmsg-routed definition:

- Worker `live-shell` + agents.yaml has an `agmsg:` block →
  dispatcher's agmsg branch spawns the worker in a fresh tmux
  pane via `/agmsg spawn`, injects `--boot-prompt`, and awaits a
  `stage:<S> status:done` message. Completion is signalled by
  the message, not by the child process exiting.
- Worker `live-shell` + no `agmsg:` block → falls through to
  Task tool / subprocess branch (per the dispatcher's fallthrough
  rule); mode value is effectively "not `single-prompt`" without
  further semantic distinction.

The old aider / `stdio: pipe` scenario is dropped from the spec —
it never materialized in the runner code and no longer reflects
intent.

### 2. `Dispatch Slash Command` — add Copilot iteration scenario

Add a scenario to the existing requirement stating that iteration
(review verdict `needs-rework` retries) with a copilot worker
SHALL take the form of a fresh `/agmsg spawn` per iteration.
Manager MUST NOT rely on `send.sh` to hand a mid-iteration prompt
to the existing copilot worker — Copilot has no Monitor.

### 3. What this change does NOT touch

- **No skill body change.** All skill logic remains as landed by
  the previous changes.
- **No agents.yaml schema change.** The `mode` field still accepts
  the same two values.
- **No worker CLI wrapping.** Nothing added to make Copilot
  "receive-capable"; that's an upstream Copilot concern.
- **No new mode value.** No `agmsg-peer` or similar. The existing
  `live-shell` value gains a more accurate definition, that's
  all.

## Spec deltas (`dashboard` capability)

- **MODIFIED** `Agent Mode Field` — rewrite worker `live-shell`
  definition.
- **MODIFIED** `Dispatch Slash Command` — add Copilot iteration
  scenario.

## Impact

- **Affected specs**: `dashboard` — 2 MODIFIED
- **Affected code**: none — spec-only change.
- **Risk**:
  - Existing aider users (hypothetical — no known deployment)
    reading the removed scenario for guidance would be caught
    off-guard. Mitigation: none needed, the runner never
    supported this in code.
  - Contributors landing new agmsg types must remember: not every
    agmsg-supported CLI has Monitor. If it doesn't, iteration
    means fresh spawn.
- **Migration**: none — documentation only.
