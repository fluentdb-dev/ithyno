---
tags: [feature/agents, feature/messaging, area/skills, agmsg, dispatch-fix]
---

# Thread `--model <id>` from `entry.args` into `/agmsg spawn`

## Why

P2b/c (`route-live-shell-to-agmsg-spawn`, archived 2026-07-17) added
the dispatcher's agmsg branch:

```
/agmsg spawn <type> <name> --boot-prompt "<resolved-prompt>"
```

`entry.args` from `agents.yaml` was intentionally dropped in that
call — the P2b/c outcome noted "no `entry.args` threading" as a
known limitation and marked it a follow-up.

Live use immediately hit that limitation: the workspace's `claude`
worker declares `command: claude, args: [--dangerously-skip-
permissions, --model, sonnet]`. Claude Code's default model is
Opus; without `--model sonnet` threading through, every agmsg-
routed code stage would spawn a fresh Opus session — expensive and
wrong for the user's intent.

Turns out **`agmsg spawn` natively supports `--model <id>` as a
pass-through**:

> `spawn.sh` line 48-49:
> ```
> --model <id>       launch the agent on a specific model. The id is passed
>                    through to the CLI.
> ```
>
> line 215-219:
> ```
> --model is pass-through: the model id is handed to the CLI unchecked (the CLI
> is responsible for validating it). Each type declares which flag to use
> (e.g. claude-code/grok-build use --model, codex uses -m). A type with no
> model_arg has no known flag, so --model is refused rather than guessed.
> ```

So the fix is skill-side only: parse `entry.args` for `--model
<id>` in the dispatcher, and append `--model <id>` to the spawn
call when present.

## What Changes

### 1. Dispatch skill — extract `--model` from `entry.args`

Update `.claude/commands/ithy-opsx/dispatch.md`'s agmsg branch.
Between the AGMSG_TYPE derivation and the `/agmsg spawn` call, add
a small extraction step:

```bash
# Extract --model <id> from entry.args if present.
MODEL_ARG=""
prev=""
for a in "${entry_args[@]}"; do
  if [ "$prev" = "--model" ] && [ -n "$a" ]; then
    MODEL_ARG="--model $a"
    break
  fi
  prev="$a"
done

# Then in the spawn call:
/agmsg spawn "$AGMSG_TYPE" "$entry_name" $MODEL_ARG --boot-prompt "<resolved-prompt>"
```

Documented rules:

- Extraction is order-agnostic in the args array — anywhere `--model
  <value>` appears, the immediately following token is taken as the
  model id.
- If `--model` appears without a following token → escalate
  `agents.yaml agent "<name>" has bare --model without a value in args`.
- If the AGMSG_TYPE is one that `spawn.sh` rejects `--model` for (a
  type without `model_arg` in its manifest — codex accepts `-m` not
  `--model` at spawn.sh level, but the pass-through auto-adapts, so
  this is mostly a Codex CLI concern), `spawn.sh` will exit non-zero
  with a clear message; dispatch surfaces that as a failure.

### 2. Other `entry.args` (`--dangerously-skip-permissions`, etc.)

Out of scope for this change. Rationale: `--model` is the specific
user request; other flags follow one of two paths:

- **`--dangerously-skip-permissions`** — Claude Code plugin trust
  is separately gated by agmsg's spawn or by the plugin's own
  install-time consent. If it turns out to be a real blocker in
  practice, follow-up with a proper "spawn options file" (agmsg's
  `spawn.options.<type>.extra_args`) mechanism.
- **Other CLI-specific flags** — pass-through per CLI needs a mapping
  table that's better handled by agmsg's own per-type spawn options,
  not by the dispatcher skill parsing arbitrary flags.

Keep scope narrow to `--model` for this change.

### 3. What this change does NOT touch

- **No server / registry / web code change**. Skill-only.
- **No agents.yaml schema change**.
- **No agmsg call other than adding `--model` to the spawn line**.
- **No P2b/c revert or scope change**.
- **No Task tool / subprocess branch change** — those branches
  already thread `entry.args` correctly, so nothing to fix there.

## Spec deltas (`dashboard` capability)

- **MODIFIED** `Dispatch Slash Command` — extend the agmsg branch
  description to note that `--model` from `entry.args` threads
  through to `/agmsg spawn`.

## Impact

- **Affected specs**: `dashboard` — 1 MODIFIED
- **Affected files**:
  - `.claude/commands/ithy-opsx/dispatch.md` — agmsg branch adds the
    `--model` extraction + threading
  - `openspec/specs/dashboard/spec.md` — PENDING annotation on the
    `Dispatch Slash Command` requirement
- **Risk**:
  - Existing entries that DON'T have `--model` are unchanged: the
    extraction returns empty and the spawn call collapses back to
    today's form.
  - `spawn.sh` may reject `--model` for some types (per line 219 —
    "type with no model_arg has no known flag"). The dispatcher
    surfaces spawn.sh's error as-is; no silent fallback (would mask
    the user's intent).
- **Migration**: none. Additive; no behavior change for entries
  without `--model`.
