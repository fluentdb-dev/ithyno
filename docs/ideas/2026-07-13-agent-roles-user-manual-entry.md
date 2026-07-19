---
date: 2026-07-13
status: idea
tags: [documentation, user-manual, agents-yaml, roles]
---

# User manual entry — agent role vocabulary

Captured while reviewing the `refine-agents-config-modal` verify
items. The Modal's role dropdown shows `code / review / verify /
manager / other` but the vocabulary is not documented anywhere
user-facing. Users can pick a role without understanding what
happens with it.

Fold this into the eventual `docs/user-manual/agents-and-roles.md`
(or the equivalent) when the manual site lands.

## Role → skill mapping

| Role | Skill | Runtime behavior |
|---|---|---|
| `code` | `/opsx:code` | Implements the change's tasks in a worktree. `-p` non-interactive Claude Code invocation |
| `review` | `/opsx:review` | Reads proposal / tasks / spec / worktree diff, writes `review.md` with verdict (pass / needs-rework) and structured findings |
| `verify` | `/opsx:verify` | Runs `npm test / typecheck / build` fail-fast, writes `review.md` with the exit-code outcome. Different from `review`: this is deterministic (script exit code), not a judgment call |
| `manager` | `/opsx:manage` | Interactive PTY session that orchestrates the loop: dispatch code → review → verify → done. Runs in the embedded Terminal panel |
| `other` | none | Free slot for future / custom agents (e.g., doc writer, migration runner). Not consumed by any current skill |

## Review vs Verify (the confusing pair)

Both write `review.md`. The difference:

- **Review** — the AI reads the change and asks "does this actually
  do what the proposal says? are there bugs? does it break other
  code?" → verdict is a judgment call
- **Verify** — the runtime runs `npm test && npm run typecheck &&
  npm run build` and reports whether they all passed → verdict is
  deterministic

Both are useful. Review catches "the code compiles and passes tests
but doesn't do the right thing". Verify catches "the code looks
right but breaks the test suite".

## Fallback when a role's agent isn't defined

Currently: the dispatch endpoint (`POST /api/agents/dispatch`) fails
with 404 when no agent matches the requested role. The Manager loop
(`/opsx:manage`) handles that by:

- Surfacing the missing-role state to the user
- Optionally running the missing role's task itself in the Manager
  session (e.g., if no `verify` agent, the Manager runs
  `npm test && ...` and writes review.md directly)

There is no automatic wildcard / fallback agent. If the user wants
that pattern (single agent that handles everything), they declare a
single agent and give it multiple `specialties` — the dispatch
matcher already scores by specialty overlap.

## Manager isn't a worker

The Modal's role dropdown intentionally omits `manager` from the
`+ Add agent` flow (per `refine-agents-config-modal`'s tightening).
Managers are declared via the Manager section's `[Declare in
agents.yaml]` shortcut only. Reason: Manager and Worker are
fundamentally different — Manager is an interactive PTY session,
Worker is a headless spawn.

## Follow-ups

- When `docs/user-manual/` exists, migrate this content there.
- Consider adding a role tooltip to the Modal that surfaces a short
  version of this table on hover.
