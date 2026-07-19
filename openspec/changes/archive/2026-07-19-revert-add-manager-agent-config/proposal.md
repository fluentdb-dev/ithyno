---
tags: [feature/revert, area/dashboard, add-manager-agent-config, area/pty]
---

# Revert add-manager-agent-config (Case β)

## Why

`add-manager-agent-config` (in-flight since 2026-07-06) proposed a
delta against the `dashboard` capability with 2 ADDED requirements:

1. **`Manager Role In agents.yaml`** — schema for `role: manager`,
   optional `initialInput:`, runtime-backed shape rejection, and
   multi-manager "pick first" fallback.

2. **`Terminal Panel Uses Declared Manager`** — PTY startup priority
   chain: `registry.managerAgent()` → `ITHYNO_TERMINAL_STARTUP` env
   var → hardcoded default `claude --continue`, plus initialInput
   stdin injection.

Both are substantially obsoleted by later changes without ever
having reached `openspec/specs/dashboard/spec.md`:

- **`reshape-agents-yaml-mode-roles`** (2026-07-14) reshaped the
  schema:
  - `role: manager` → `roles: [manager]` (array)
  - runtime-backed shape distinction removed entirely (replaced by
    `mode: single-prompt` vs `mode: live-shell`)
  - `initialInput:` folded into per-role `prompts:` textareas
- **`refine-agents-config-modal` + `revert-refine-agents-config-modal`**
  (2026-07-19) enforced manager singleton (`Manager Agent Server-Side
  Singleton Guard`) — contradicting the original "zero, one, or many
  (pick first)" clause.
- **`pty-startup-default-fresh-session`** and
  **`pty-startup-uses-project-session-id`** (2026-07-19) replaced the
  hardcoded `claude --continue` fallback with per-project session-id
  logic (`claude --session-id <uuid>` first launch, `--resume <uuid>`
  after).
- **`wrap-embedded-pty-in-tmux`** (`Embedded PTY Uses tmux When
  Agmsg Is Configured`, currently in `openspec/specs/dashboard/spec.md`
  line 2536+) already codifies the surviving 3-tier priority chain
  (manager entry → env var → session-id fallback) plus `initialInput`
  stdin injection.

What actually stands in code as of today:

- **Server-side manager guards** (delete + singleton) — spec'd by
  `Manager Agent Server-Side Singleton Guard` (landed 2026-07-19 via
  `revert-refine-agents-config-modal`).
- **Manager entry drives PTY startup** — spec'd by `Embedded PTY
  Uses tmux When Agmsg Is Configured` including the "agmsg block
  absent → direct spawn unchanged" scenario.
- **`ITHYNO_TERMINAL_STARTUP` env var override** — spec'd by both
  the tmux requirement above and the `App Identity is "ithyno"`
  requirement's `ITHYNO_*` env var scenario.
- **Fresh-project session-id fallback** — spec'd by the tmux
  requirement's 3-tier priority chain.

There is NO gap in current spec that add-manager-agent-config's
delta would fill; every still-standing piece is already
authoritatively covered. Rather than rewrite the delta to remove
the obsoleted bits and duplicate the covered bits, retire refine
wholesale via a Case β revert following the same pattern as
`revert-refine-agents-config-modal` (2026-07-19).

**Implementation code stays.** `registry.managerAgent()`,
`ITHYNO_TERMINAL_STARTUP` env resolution, and the `initialInput`
auto-injection all remain in effect. Only the openspec artifact is
retired.

## Targets

All Case β.

1. **`add-manager-agent-config`** (in-flight, Case β): retire the
   entire in-flight delta. Its 2 ADDED requirements are covered by
   the current spec (via multiple successor requirements) OR are
   obsoleted by reshape. Retirement does not remove any
   currently-authoritative statement about manager PTY routing.

## What Changes

### Spec (ADDED — 1 requirement, retirement marker)

The `Embedded PTY Uses tmux When Agmsg Is Configured` requirement
(currently the only requirement that names the 3-tier startup
priority chain) has its scope focused on tmux wrapping. This revert
adds a small companion requirement that makes the "manager entry
drives PTY startup even in the pre-P2 no-tmux code path" explicit
and separable from the tmux wrapping concern.

- `dashboard`: **ADDED** `Manager Entry Drives Fresh PTY Startup`

### Impl

- **No code changes.** The 3-tier priority chain remains encoded in
  `server/sync/pty.ts::ptyStartup(registry)`, unchanged since
  add-manager-agent-config's original impl. Verified indirectly by
  the existing `server/sync/pty.test.ts` (7 tests covering all
  priority tiers).

## Case β revert validity

add-manager-agent-config is in-flight (never applied to
`openspec/specs/dashboard/spec.md`). Its 2 ADDED requirements are
individually superseded — the schema half by reshape's `Agent
Roles Array` and Manager Agent Server-Side Singleton Guard, and
the PTY routing half by the tmux requirement's 3-tier chain and
the session-id changes. Retiring add-manager-agent-config wholesale
via Case β does not alter the current authoritative spec except
through the small ADDED companion above.

## Blast radius

- `openspec/changes/add-manager-agent-config/` moves to
  `openspec/changes/archive/2026-07-19-add-manager-agent-config/`
  after its `specs/` is deleted.
- `openspec/specs/dashboard/spec.md` gains one ADDED requirement
  (`Manager Entry Drives Fresh PTY Startup`) that separates the
  no-tmux code path's contract from the tmux wrapping concern.
- No code changes; no user-facing UI changes; no test changes.

## Out of scope

- **Rewriting `Embedded PTY Uses tmux`** to reference the new
  companion requirement — the two can coexist; the tmux requirement
  remains self-contained and the companion documents the same 3-tier
  chain from the non-tmux angle.
- **Consolidating both requirements into one canonical "PTY
  startup" section** — leave for a future refactor.
