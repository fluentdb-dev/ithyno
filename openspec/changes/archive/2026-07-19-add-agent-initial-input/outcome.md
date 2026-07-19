# Outcome: add-agent-initial-input (reverted)

**Reverted by [revert-add-agent-initial-input](../revert-add-agent-initial-input/) — 2026-07-19.**

The impl code is NOT reverted; the `initialInput` field remains in
`agents.yaml` and continues to be delivered to the child. However,
the delivery mechanism has shifted twice since this change landed
(2026-06-30):

1. `add-runtime-abstraction` introduced per-runtime `promptStyle`
   (later collapsed).
2. `reshape-agents-yaml-mode-roles` (2026-07-14) replaced the
   runtime abstraction with a two-way `mode` field. The runner
   now switches on `mode`:
   - **`mode: live-shell`** → resolved prompt lives in
     `AgentPublic.initialInput` and is typed into the PTY (not
     `child.stdin.write()`).
   - **`mode: single-prompt`** command-only → `initialInput`
     stays undefined; the prompt lives in `args[]` instead.

The original stdin-write requirement (`Optional Initial Input on
Agent Spawn`) accurately described the v1 implementation but no
longer matches either post-reshape path. Rather than rewrite the
delta to cover both modes, retire this change wholesale via Case
β. The revert's ADDED requirement `initialInput Field Applies
Per Agent Mode` captures today's mode-based dispatch.

## ✅ Worked (retained for history)

- **stdin-write approach was portable across REPL CLIs**. The
  concept of "prompt hits child's stdin at spawn" is the right
  Unix-standard shape for coding CLIs that are REPLs first.
  Post-reshape, live-shell agents receive the prompt via PTY
  keystroke injection — same intent, different mechanism.
- **Template substitution reuse** (`${change_id}` etc.). The
  substitution engine was shared with `args` and `env` on day one,
  and that decision survives to today's per-role `prompts` map.
- **stdin echo in the transcript** landed cleanly. The
  `stream: "stdin"` output-buffer entry was small, useful, and
  survives in the current PTY delivery path (visible as typed
  input in the terminal scrollback).

## 🌱 Follow-ups (superseded)

- The originally proposed "structured multi-step initial input"
  (`initialInputs: [{data, delay}]`) never surfaced as a real
  need. The per-role `prompts` map post-reshape gives one string
  per role and that has been enough.
