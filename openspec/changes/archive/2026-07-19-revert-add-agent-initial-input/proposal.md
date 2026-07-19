---
tags: [feature/revert, area/server, area/agent-runner, add-agent-initial-input]
---

# Revert add-agent-initial-input (Case β)

## Why

`add-agent-initial-input` (in-flight since 2026-06-30) proposed a
delta against `agent-runner`:

- **ADDED**: `Optional Initial Input on Agent Spawn` — the runner
  SHALL write the `initialInput` string plus trailing newline to
  the child's stdin immediately after spawn, once, for any agent
  with the field set. Portable stdin-write approach.

That was the correct v1 solution when the proposal landed. Since
then, two changes shifted the ground:

1. **`add-runtime-abstraction`** introduced a runtime-abstraction
   layer that (temporarily) supported multiple prompt-delivery
   modes (`cli-arg`, `stdin`, `file`) via a per-runtime
   `promptStyle` field. The runner was refactored to switch on
   promptStyle rather than always writing to stdin.

2. **`reshape-agents-yaml-mode-roles`** (archived 2026-07-14)
   collapsed the runtime abstraction into a two-way `mode` field
   (`single-prompt` vs `live-shell`). The runner's initialInput
   handling now branches on mode instead:

   - **`mode: live-shell`** → resolved prompt is placed in
     `AgentPublic.initialInput` and typed into the PTY by
     `attachPtyToSocket` (post-spawn, via keystroke injection).
     `initialInputMode: "stdin"` in the registry's public shape.
   - **`mode: single-prompt`** (command-only) → `initialInput`
     stays undefined; the prompt is expected to live inside the
     agent's own `args`, which the user hand-authors.
     `initialInputMode: "cli-arg"`.

Additionally, `Initial Input Translation` (already in
`openspec/specs/agent-runner/spec.md` line 131) describes the
runner translating `initialInput` into a `-p "<value>"` CLI arg —
which was accurate when it landed but is now partially superseded
too (command-only single-prompt agents don't reach that path
because `initialInput` is undefined for them).

The stdin-write requirement in `add-agent-initial-input` therefore:
- **Contradicts current live-shell behavior** — the write happens
  via PTY keystroke injection, not `child.stdin.write()`. Different
  code path, different constraints (PTY buffering vs pipe
  buffering, echo behavior).
- **Contradicts current single-prompt behavior** — there's no
  initialInput write for command-only agents; the prompt lives in
  args instead.

Rather than rewrite the requirement to cover the current mode-based
dispatch, retire `add-agent-initial-input` wholesale via Case β
following the same pattern as `revert-refine-agents-config-modal`
and `revert-add-manager-agent-config` (both landed 2026-07-19).

The **implementation code stays** — the `initialInput` field
exists, is resolved per mode, and is delivered via the appropriate
mechanism. Only the spec artifact is retired.

## Targets

All Case β.

1. **`add-agent-initial-input`** (in-flight, Case β): retire the
   entire in-flight delta. The single ADDED requirement's stdin-
   write contract does not match current implementation; a fresh
   companion requirement in the revert captures the mode-based
   delivery.

## What Changes

### Spec (ADDED — 1 requirement)

Post-revert baseline for `agent-runner`: capture the mode-based
delivery mechanism explicitly.

- `agent-runner`: **ADDED** `initialInput Field Applies Per Agent Mode`

### Impl

- **No code changes.** `AgentRegistry.resolve()` in
  `server/agents/registry.ts` continues to populate
  `initialInput` + `initialInputMode` per the agent's `mode`
  field. Existing tests (`registry-initial-input.test.ts`) cover
  both branches.

## Case β revert validity

`add-agent-initial-input` is in-flight (its ADDED delta never
reached `openspec/specs/agent-runner/spec.md`). The proposed
stdin-write behavior was superseded by later mode-based dispatch
without ever being codified as authoritative. Retiring wholesale
via Case β does not remove any currently-authoritative statement.

## Blast radius

- `openspec/changes/add-agent-initial-input/` moves to
  `openspec/changes/archive/2026-07-19-add-agent-initial-input/`
  after its `specs/` is deleted.
- `openspec/specs/agent-runner/spec.md` gains one ADDED
  requirement documenting how `initialInput` is delivered per mode.
- No code changes; no user-facing UI changes; no test changes.

## Out of scope

- **Reconciling `Initial Input Translation`** (agent-runner line
  131) with today's mode-based dispatch — the `-p` translation
  path still exists for agents that DO reach it, but the
  requirement's phrasing could be tightened. Leave for a future
  refactor.
- **Merging `initialInput` behavior with tmux-scoped
  `Embedded PTY Uses tmux` requirement's `initialInput` injection
  scenario** — same code path, different capabilities; overlap is
  minor. Leave to a future consolidation change.
