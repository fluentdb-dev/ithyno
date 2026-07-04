## Context

`add-agent-runner` shipped worktree spawn with `stdio: ["ignore",
"pipe", "pipe"]` — read output, ignore input. That was fine for
non-interactive tools. It stopped being fine as soon as we spawned
Claude Code CLI, which asks for confirmation before writes into
directories it hasn't seen. Agents block silently, exit 0 without doing
work, and leave empty branches.

The escape hatches are:
- **YOLO**: `--dangerously-skip-permissions` (Claude) / equivalent —
  already possible today, just documented under-emphasized.
- **Interactive**: send input to the agent — not possible today.

Both should be supported. Users who trust their agent + worktree
isolation can add the flag; users who want to review every step get an
interactive channel.

## Goals / Non-Goals

**Goals:**
- Server can write to the agent's stdin.
- UI can send input to a specific running job with one-line ergonomics.
- Sent input shows up in the job's output transcript so review after
  the fact is possible.
- Existing agents that don't need stdin are unaffected — they just
  never see anything arrive on it.

**Non-Goals:**
- Detecting specific prompt patterns and offering per-tool "Y / N"
  buttons. Different CLIs prompt in different formats; brittle to
  hard-code. Future work.
- Filesystem ACLs (`allow_writes: ["docs/**"]`) at the runner level.
  Different design axis; deferred.
- Bi-directional REPL parity with the embedded terminal. The agent
  panel is a "post + review" surface, not a full PTY. If we need
  fully-interactive per-agent terminals, that's a separate change with
  a different UX (extra PTY WS per job).

## Decisions

### Stdio: `["pipe", "pipe", "pipe"]`

Non-controversial. The pipe stays open for the lifetime of the child.
When the child exits, its stdin is closed as a side effect (Node cleans
it up).

Considered `"inherit"` for stdin — rejected, that would connect the
child's stdin to the parent (fastify) process's stdin, which would
either pull the API server's stdin (bad) or connect to `/dev/null`
(equivalent to ignore). `"pipe"` is the right knob.

### Newline handling

The default is `appendNewline: true` — most CLIs treat one line of
input as one response. Users can pass `appendNewline: false` when they
need to send a raw byte stream (rare; escape hatch).

### Echoing sent input into the transcript

Two options considered:

- **Only stdout/stderr as today**. Simpler, but user has no visual
  confirmation their input was accepted, and the transcript is
  half-a-conversation on review.
- **Echo `[stdin] <data>` into the same ring buffer**. Transcript is
  self-contained; downside is that the echo happens whether or not the
  agent actually reads the byte (imagine writing to an agent that's
  crashed but the pipe is still up momentarily). Acceptable — a lost
  echo is a rounding error compared to the readability gain.

Choice: echo. Ring buffer entries carry `stream: "stdin" | "stdout" |
"stderr"`. UI paints `stdin` distinctly (subtle color / prefix).

### Auth

Same gate as every other mutating agent endpoint (`/run`, `/cancel`):
- localhost only
- session token required
- Origin allow-list

No additional per-job authorization. If you can talk to the runner at
all, you can send input to any of its jobs. Local-only enforcement
carries the security boundary.

### Input placement in the UI

Chose: **inline field inside `JobRow` when the job is running and the
Output tab is open**. Reasons:
- Contextually paired with the output the user is reading
- Enter to send is muscle-memory
- Disabled state has a natural home there

Rejected: modal on demand (an extra click; hides the transcript while
typing), global command bar (loses per-job context).

### Error surfaces

- **Job not running (finished / crashed / cancelled)**: endpoint 409.
  UI shows the field disabled with tooltip; if a stale field send races
  with a job finish, the toast surfaces the reason.
- **Pipe write error** (EPIPE / closed pipe): endpoint 500. Toast.
- **Auth failure**: 401 / 403 → existing `AuthExpiredError` banner.

### Backward compatibility

Existing `agents.yaml` entries continue to work unchanged. Agents that
never read stdin behave exactly as before — the pipe stays quiet.

## Alternatives considered

- **Ship YOLO as the default**. Rejected: silently escalates trust
  levels for existing users. Interactive stdin is the new capability;
  YOLO stays user-opt-in as it is today.
- **Attach a PTY per agent** so the UI can render a full REPL.
  Rejected for v1: heavier, requires per-job WS, and the current pain
  point ("I need to type `y`" or "I need to pick option A") is
  covered by a one-line stdin field.
- **Detect prompts in the output stream, expose "Approve" buttons**.
  Rejected for v1: fragile, per-CLI logic. Nice future layer *on top of*
  stdin relay.
- **Filesystem-level ACLs at spawn time**. Rejected as a different
  design axis, not "should the user be able to answer prompts."

## Risks

- **Silent stdin drops**: writing to an agent that has closed its
  stdin (or a broken pipe) throws EPIPE. Server catches it and surfaces
  as 500; UI shows a toast. Not silent.
- **Prompt / response race**: user hits Send just as the job finishes.
  409 back, toast explains. No stuck state.
- **Multi-tab echo confusion**: two tabs send input at the same time.
  Both echoes are broadcast via the existing `agent-job-output` WS
  event to all tabs. Order matches server-side arrival; no locking
  needed for v1.
