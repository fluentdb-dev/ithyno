## Context

`ptyStartup()` (`server/sync/pty.ts`) currently makes exactly one
decision gate the tmux wrap: `registry?.agmsg() ?? null`. If that's
non-null, wrap in `tmux new-session -A -s <session> -- <cmd>`
(falling back to a banner if the `tmux` binary is missing); otherwise
spawn `<cmd>` directly. `AgentRegistry` only exposes `agmsg()` — there
is no independent tmux signal to read.

## Goals

- Let a project opt into tmux-wrapped Manager sessions without
  configuring agmsg.
- Zero behavior change for existing `agmsg:`-configured projects.
- Keep the toggle a plain top-level scalar, consistent with
  `parallelExecution: true` / `maxParallel: 3` already in this file —
  no nested object, no new file.

## Non-Goals

- No UI/Settings exposure for this toggle. `agents.yaml` is a
  hand-edited config file for every other top-level knob today; this
  one follows the same pattern. (A UI toggle can be a later change if
  requested.)
- No change to session-naming, the fallback-banner text, or the
  `-A` attach-or-create semantics — only the *condition* that decides
  whether to wrap changes.
- No change to worker-pane tmux usage (`/agmsg spawn`) — that's
  gated entirely by the `agmsg` block already and is untouched here.

## Decisions

### Schema: new top-level `tmux: boolean`

```yaml
tmux: true
agmsg:
  team: openspec-ui
```

Mirrors `parallelExecution`'s validation shape: absent → `false`
(default, matches current no-tmux-without-agmsg behavior byte for
byte). Present and not a boolean → throw (same style as
`validateParallelExecution`), which — per the registry's
last-known-good cache pattern — surfaces as an error banner rather
than crashing the dashboard.

### `AgentRegistry.tmux()`

New accessor returning the raw parsed boolean (default `false`),
parallel to `agmsg()`. Deliberately does NOT fold in the
`agmsg !== null` implication itself — that composition happens once,
at the `ptyStartup()` call site, so the registry stays a thin
parsed-value store and the "agmsg implies tmux" policy lives in one
place (the PTY layer, which is the only current consumer of either
signal for this purpose).

### `ptyStartup()` condition

```ts
const agmsg = registry?.agmsg() ?? null;
const tmuxEnabled = (registry?.tmux() ?? false) || agmsg !== null;
...
if (!tmuxEnabled) {
  // unchanged direct-spawn path
}
// unchanged tmux-wrap / fallback-banner path
```

Session naming (`tmuxSessionName(projectRoot)`), the `-A` flag, and
the missing-tmux banner text are all reused verbatim — none of them
reference `agmsg` today, they only fire inside the "wrap" branch.

## Risks

- **Silent no-op if someone expects `tmux: false` to defeat an
  `agmsg:` block.** Explicitly not supported — the proposal states
  agmsg continues to imply tmux ON unconditionally. Documented in the
  spec delta's requirement body so it isn't discovered by surprise.
- **Toggle sprawl in `agents.yaml`.** Accepted — every other runtime
  knob in this file is a flat top-level scalar; adding a differently
  shaped config surface (e.g. `agmsg.tmux: true`) would be more
  surprising, not less.
