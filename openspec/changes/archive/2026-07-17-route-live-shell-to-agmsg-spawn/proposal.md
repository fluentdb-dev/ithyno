---
tags: [feature/agents, feature/messaging, area/skills, agmsg, tmux, phase-2b-of-3]
---

# Route live-shell workers via `/agmsg spawn --boot-prompt`

## Why

P1 (`add-agmsg-config-block`, archived) landed the `agmsg` config
block. P2 (`wrap-embedded-pty-in-tmux`, archived) put the Manager in
a tmux session when agmsg is configured. P2b/c (this change) closes
the loop: when the Manager dispatches a `mode: live-shell` worker
under an agmsg-configured workspace, it uses `/agmsg spawn <type>
<name> --boot-prompt "<prompt>"` instead of subprocess `-p …`.

`agmsg spawn --boot-prompt` conflates the two operations we were
planning to split (P2b dispatcher routing + P2c worker bootstrap) —
one call spawns the peer in a new tmux pane, registers it in the
team room, and injects the boot prompt. Splitting is more effort
than value once we saw agmsg's API. Merging keeps the change small
and its scope aligned with agmsg's natural surface.

## What Changes

### 1. Dispatch helper protocol — new branch for live-shell + agmsg

Update `.claude/commands/ithy-opsx/dispatch.md`. The current step 3
"Dispatch based on `entry.command`" has two branches:

- `entry.command == "claude"` → **Task tool**
- Otherwise → **subprocess** `-p`

Add a third branch (checked first):

- `entry.mode == "live-shell"` AND `agmsg` block present in
  agents.yaml → **agmsg spawn**:

  ```
  /agmsg spawn <agmsg-type> <entry.name> --boot-prompt "<resolved-prompt>"
  ```

  Where `<agmsg-type>` is derived from `entry.command` via a fixed
  mapping table:

  | `entry.command` | `<agmsg-type>` |
  | --- | --- |
  | `claude` | `claude-code` |
  | `codex` | `codex` |
  | `copilot` | `copilot` |
  | `gemini` | `gemini` |
  | `antigravity` | `antigravity` |
  | `opencode` | `opencode` |
  | `cursor` | `cursor` |
  | (unmapped) | escalate `agmsg-type unknown for command: <cmd>` |

  Fixed mapping keeps this change zero-touch on `agents.yaml`; users
  who need a non-default mapping can declare an explicit
  `agmsgType: <type>` field on the agent — deferred to a follow-up
  if the fixed table proves insufficient.

Manager (`roles` includes `manager`) is never dispatched through
this branch — Manager runs in tmux pane 0 as the tmux new-session
target (per P2). This branch only fires for worker roles.

### 2. Success judgment — polling for the artifact

`agmsg spawn` blocks until the peer is *listening*, not until the
boot task is *done*. Since the 3-stage success contract already
consumes `review.md` (the file, not a subprocess exit) for
review/verify, we extend the same contract to the agmsg branch:

- **`S = code`**: after `agmsg spawn --boot-prompt`, poll git log on
  `agent/<change-id>` for a new commit (indicating the worker
  finished + committed via `/ithy-opsx:apply`). Timeout after 15 min
  → escalate `code stage agmsg worker did not commit within timeout`.
- **`S = review` or `S = verify`**: after `agmsg spawn --boot-prompt`,
  poll `openspec/changes/<change-id>/review.md` for existence +
  parseable `verdict:` frontmatter. Timeout after 5 min → escalate
  `<stage> agmsg worker did not produce review.md within timeout`.

The `subprocess exit code` limb of the current 3-stage contract does
not apply to the agmsg branch (spawn returns fast). The other two
limbs (artifact existence, verdict frontmatter) work identically.

### 3. What this change does NOT touch

- **No server / registry code change**. Skill-only. `agents.yaml`
  schema is unchanged.
- **No `agmsgType` field on agents.yaml**. Command-name inference
  covers the standard cases; an explicit override is deferred.
- **No Manager-in-agmsg change**. The Manager still bootstraps as
  today: tmux pane 0 running the `role: manager` entry's command.
  Its `/agmsg spawn` calls are what land workers in adjacent panes.
- **No fallback to subprocess when agmsg is unavailable**. If
  `agmsg` isn't installed (Claude plugin missing) OR the workspace
  has no `agmsg:` block, dispatch falls through to today's Task
  tool / subprocess branches. No degraded path — the tmux/agmsg
  route is opt-in via the config block.
- **No worker cleanup**. `agmsg spawn` creates a new pane per call;
  stale panes accumulate. Cleanup (session housekeeping, pane kill
  on task done) is a follow-up.

## Spec deltas (`dashboard` capability)

- **MODIFIED** `Dispatch Slash Command` — extend the protocol to
  cover the agmsg branch and its polling-based success judgment.

## Impact

- **Affected specs**: `dashboard` — 1 MODIFIED
- **Affected files**:
  - `.claude/commands/ithy-opsx/dispatch.md` — new dispatch branch,
    updated 3-stage contract text
  - `openspec/specs/dashboard/spec.md` — PENDING annotation on the
    `Dispatch Slash Command` requirement (per CLAUDE.md hard rule)
- **Risk**:
  - `agmsg` not installed on user's Claude → the `/agmsg spawn`
    slash command doesn't resolve, the skill fails at the dispatch
    step. Mitigation: the skill checks for `/agmsg spawn`
    availability before entering the branch (guarded via presence
    of `~/.agents/skills/agmsg/scripts/send.sh`); when absent, warn
    the user and fall back to the subprocess branch.
  - Command-name inference misses non-canonical CLIs (e.g. a user's
    `claude-wrapper` script). Mitigation: escalate cleanly with
    "agmsg-type unknown for command: …" so the user knows to add an
    explicit override in the follow-up.
  - Polling timeouts (15 min code / 5 min review-verify) are
    hand-picked; tuning may be needed. Mitigation: constants live
    at the top of the skill's step section and are easy to adjust.
- **Migration**: none. Workspaces without an `agmsg:` block see zero
  behavior change. Workspaces with the block see the new dispatch
  branch active.
