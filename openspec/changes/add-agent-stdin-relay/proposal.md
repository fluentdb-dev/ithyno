---
tags: [feature/agent-runner, area/server, area/web]
---

## Why

Worktree-spawned agents can block on interactive prompts. The current
canonical case is Claude Code CLI's permission model — the agent stops
and asks the user "Approve writes to `vscode-extension/`?" — but any
CLI that prompts (Aider's `y/N`, Codex's file-write confirmation,
custom scripts asking for input) hits the same wall.

Today the agent runner spawns with `stdio: ["ignore", "pipe", "pipe"]`.
**No one can answer the prompt.** The agent waits, eventually exits
with code 0, and leaves an empty branch. The user only discovers this
by reading the captured stdout — after the fact.

`--dangerously-skip-permissions` (Claude) and similar YOLO flags are one
answer, but **permission has each user's own criteria**. Some users want
to review every write; some want a specific scope (allow docs, deny
code); some just want to type `y`. The right long-term posture is
**both**:

1. **Configuration option** — users who prefer YOLO put the flag in
   `agents.yaml` and never see prompts. Available today; just document.
2. **Stdin relay** — users who want to review can send responses to the
   running agent from the dashboard. Not available today; this change
   adds it.

## What Changes

### Server

- The agent runner spawns children with `stdio: ["pipe", "pipe", "pipe"]`
  (was `["ignore", "pipe", "pipe"]`).
- The `Job` type gains a private `stdin` handle held by the runner
  process; it is never serialized to the wire.
- New endpoint **`POST /api/agents/jobs/:id/input`** accepts
  `{ data: string, appendNewline?: boolean }` and writes to the child's
  stdin. Same auth + CSRF + localhost gates as other mutating endpoints.
- If the job is not running (finished, cancelled, crashed), the endpoint
  returns 409 with a clear reason.
- If the pipe write throws (rare — closed pipe), the endpoint returns
  500 with the error message.

### Web

- The Agents page's `JobRow` gains an **inline input field** when the
  job is `running` and the Output tab is open. Placeholder text
  `"Send input to agent (Enter = send)"` — Enter submits + clears the
  field; Shift-Enter inserts a newline.
- Sent input is echoed into the output view as a `[stdin]` line
  (labelled as a distinct stream), so the transcript captures both what
  the user typed and what the agent replied.
- The input is disabled with an explanatory tooltip when the job is not
  running.

### Convention documentation

- Document `--dangerously-skip-permissions` (and equivalent YOLO flags
  for other CLIs) as a supported knob in `agents.yaml.example`.
  Existing users who prefer non-interactive runs stay non-interactive
  by putting the flag in `args`. No default change; this change simply
  makes the alternative (interactive review) possible.

## Capabilities

### New Capabilities
<!-- none — this is a modification of an existing capability -->

### Modified Capabilities
- `agent-runner`: stdin becomes writable by the dashboard; agents can be
  interacted with mid-run instead of silently blocking on prompts

## Impact

- **`server/agents/runner.ts`**: `stdio` change; retain `child.stdin`
  handle on the `Job`; new `writeInput()` method on `AgentRunner`.
- **`server/index.ts`**: new endpoint `POST /api/agents/jobs/:id/input`
  wired to the existing auth + Origin + localhost middleware chain.
- **`web/src/api.ts`**: `sendAgentInput(jobId, data, appendNewline)`
  helper via `postJson`.
- **`web/src/store.ts`**: no state changes required beyond appending an
  echo line to `jobOutputs[jobId]` via the existing `appendJobOutput`
  path — mark the appended line with a new `stream` value `"stdin"` so
  the UI can style it distinctly.
- **`web/src/types.ts`**: extend the `OutputLine.stream` union to
  include `"stdin"`.
- **`web/src/pages/Agents.tsx`**: input field in `JobRow`; `<span>`
  styling for the `[stdin]` stream.
- **`agents.yaml.example`**: comment block documenting
  `--dangerously-skip-permissions` for Claude and the equivalent
  headless flags for other supported CLIs.

## Out of scope

- **Prompt detection / auto-approve UI**: parsing agent output to
  detect "Approve? Y/N" and offering one-click buttons. Interesting but
  language-specific and prompt-format-brittle. If we do it later, it
  layers on top of stdin relay, not instead of.
- **Per-agent stdin permission model in `agents.yaml`**
  (e.g. `allow_writes: ["docs/**"]`). That is a whole separate design —
  filesystem-level ACL enforcement between the runner and the agent.
- **Persisting the input transcript separately from stdout/stderr**.
  For v1, stdin echoes join the same ring buffer. If ever needed we can
  split later.
- **Approval broadcast across sessions**. Only the dashboard tab that
  sends the input sees the echo synchronously; other tabs pick it up
  through the existing WS output broadcast. No cross-tab lock is added.
