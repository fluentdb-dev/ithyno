---
tags: [feature/agents, feature/messaging, area/skills, agmsg, dispatch-redesign]
---

# Signal stage completion via agmsg message (replace polling)

## Why

P2b/c (`route-live-shell-to-agmsg-spawn`, archived 2026-07-17)
introduced the dispatcher's agmsg branch with **poll-based**
success judgment:

- code stage: poll `git log agent/<change-id>` every 5s for a new
  commit head, timeout at 15 min → escalate
- review/verify stages: poll `review.md` for existence + parseable
  `verdict:` frontmatter every 5s, timeout at 5 min → escalate

Today's end-to-end verify (`verify-dispatch-e2e`, this branch)
surfaced concrete failures in that polling model:

- **Code stage's git-log trigger is wrong**. Claude Code's
  `/ithy-opsx:apply` paused at an interactive commit-confirmation
  prompt; the worker never committed autonomously. The Manager
  ended up committing manually because the poll would have timed
  out otherwise. `git log` is the wrong signal — the worker
  finishing is not the same as the worker committing.
- **Verify stage's review.md trigger is wrong**. review.md already
  landed with `verdict: pass` after review stage. The verify
  polling saw the existing file and would have succeeded
  immediately without verify actually running. No pre-verify
  snapshot mechanism exists.
- **Live-shell semantic mismatch**. The agmsg branch treats every
  dispatch as a fresh spawn + boot-prompt (shot-and-scoot), which
  is at odds with "live-shell = persistent worker". The polling
  model is what forces fresh spawn per iteration (there's no
  channel to send the next prompt to an existing worker without
  Monitor).

The fix in this change (per the user's Option A): keep the
existing `review.md` artifact contract (durable record, unchanged
history/archive semantics), but **replace polling with a message
signal**. The worker sends `stage:<X> status:done` (with details)
to Manager via `agmsg send` when finished. Manager receives via
Monitor mode and reads the existing artifact (review.md verdict,
or git log HEAD) for stage judgment.

## What Changes

### 1. Dispatch skill — agmsg branch spawn boot-prompt gains a report contract

Update `.claude/commands/ithy-opsx/dispatch.md`. The agmsg
branch's boot-prompt SHALL append a report instruction so the
worker knows how to signal completion:

```
Reply to Manager via:
  ~/.agents/skills/agmsg/scripts/send.sh openspec-ui <entry.name> manager \
    "stage:<S> status:done"
after your task completes. Do NOT re-implement — one round only.
```

Concretely, resolved boot-prompt becomes:

```
<resolved-prompt>

--- report contract ---
When your task completes (whether the review verdict is pass or
needs-rework, whether the code compiled or not), send exactly ONE
message to Manager via:
  ~/.agents/skills/agmsg/scripts/send.sh openspec-ui <entry.name> manager \
    "stage:<S> status:done"
This tells Manager to inspect the review.md artifact (or git log
for code stage) and advance the workflow. Send exactly once.
```

### 2. Dispatch skill — replace polling with message wait

Replace the "5s poll `git log`" (code) and "5s poll `review.md`"
(review/verify) subsections of the 3-stage success contract with
message-based receipt logic:

- Manager, after spawning the worker, waits for an inbox message
  matching `from:<entry.name> body:^stage:<S> status:done`.
- Wait uses `agmsg check-inbox.sh` (or the Monitor tool) with a
  5-second poll and the same ceilings (15 min code / 5 min
  review-verify).
- On message receipt, Manager reads the artifact:
  - **code stage** → check `git log agent/<change-id>` head vs the
    pre-spawn head. If unchanged AND the message body includes a
    "commit:<sha>" hint, use that. If truly no commit and the
    worker's tree has staged/unstaged changes, Manager commits on
    the agent branch (fallback). Advance phase.
  - **review / verify** → read `openspec/changes/<change-id>/
    review.md`, parse verdict frontmatter, route as today
    (pass → advance / needs-rework → next iteration).
- No message within the ceiling → escalate `<stage> agmsg worker
  did not report within timeout`.

### 3. Retained artifact contract

**`review.md` remains the authoritative record** for review /
verify stages. Worker still writes it (per today's
`/opsx:review` / `/ithy-opsx:verify` skill behavior). The change
here is only how Manager KNOWS when the file is ready — via message
rather than periodic polling.

### 4. Copilot-workers compatibility

Copilot lacks the Monitor tool for receiving messages, but it
**can send** via `send.sh`. In this design, copilot workers only
need to send once at end-of-task — no receiving required. So the
message-based signaling model works for both claude-code and
copilot workers.

Existing limitation (copilot cannot be re-sent to for iteration)
stays out of scope; iteration for copilot workers means fresh
spawn per iteration, same as today.

### 5. What this change does NOT touch

- **No change to `review.md`'s schema, location semantics, or
  archive flow**. The file remains the durable record.
- **No change to the Task tool / subprocess branches**. Those
  paths use exit-code judgment and are untouched.
- **No change to `--model` threading** or `spawn_options.yaml`
  auto-sync. Those layers are independent.
- **No change to `mode` semantics**. `single-prompt` still means
  headless subprocess; `live-shell` still means agmsg-routed peer.
- **No change to the `review.md` location bug** (Copilot's
  `/opsx:review` writes to main tree instead of worktree). That's a
  worker-skill-level issue, separate follow-up.
- **No polling loop for iteration**. If a stage returns
  needs-rework, the dispatcher spawns a new worker (fresh session)
  with `priorFindings` in the boot-prompt — same as today.

## Spec deltas (`dashboard` capability)

- **MODIFIED** `Dispatch Slash Command` — the agmsg branch's
  success contract switches from polling to message-based wait;
  the boot-prompt gains the report contract.

## Impact

- **Affected specs**: `dashboard` — 1 MODIFIED
- **Affected files**:
  - `.claude/commands/ithy-opsx/dispatch.md` (skill body)
  - `openspec/specs/dashboard/spec.md` (PENDING annotation + delta
    application at archive time)
- **Risk**:
  - A worker that finishes but forgets to send the report message
    → Manager waits until timeout → escalates. Documented; the
    boot-prompt is explicit about the requirement.
  - Race between message-receipt and file-write: worker sends
    message BEFORE review.md is flushed to disk. Mitigation: after
    receipt, Manager retries the artifact read once with a 1-second
    delay before failing.
  - Two messages from the same worker → duplicate. Mitigation:
    Manager processes only the first matching message per stage.
- **Migration**: none. Existing agents.yaml, review.md schemas,
  archive flows all unchanged. Only the dispatcher's judgment
  path changes.
