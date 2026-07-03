## Context

`add-ui-orchestration` taught the project that **the UI initiates workflow
commands, the embedded terminal executes them, Claude Code carries the LLM
responsibility**. That model is fine for one human running one change at a
time. The next step is multiple agents working in parallel on different
changes — and that requires structural isolation so they don't trample each
other's working trees.

`git worktree` solves that natively. Combined with a tiny server-side job
registry, `child_process.spawn`, and the existing PTY for surfacing git
commands to the user, we can deliver MVP-1 of the
[task-assignment](../../../docs/ideas/2026-06-24-task-assignment.md) pipeline
without taking on the Agent SDK, custom auth, or any cloud surface.

## Goals / Non-Goals

**Goals:**
- One-click Run on a change card spawns an isolated agent in `.worktrees/<id>/`.
- Stream the agent's stdout/stderr live to the dashboard.
- Track jobs server-side with a per-change lock so duplicate runs are rejected.
- Manual merge / discard via the existing PTY inject (git operations stay
  visible in the user's terminal).
- Multiple changes can run in parallel.

**Non-Goals:**
- Per-task assignment within a change (MVP-3, separate change).
- Multi-role pipelines like implement → test → review (MVP-2, separate
  change). v1 runs one agent per change.
- Auto-merge or PR creation. v1 always requires the user to merge.
- Agent SDK integration. v1 is `child_process.spawn` only.
- Cross-machine orchestration. Local-only, like everything else.
- Resuming a job after a server restart. Job state is in-memory; if the
  server dies, the worktree remains on disk and the user recovers manually.
- Live progress reflection inside the worktree (e.g. tasks.md edits made by
  the agent in `.worktrees/<id>/openspec/changes/<id>/tasks.md` do NOT
  surface on the main dashboard's kanban — the watcher only follows the
  main working tree). Progress is observable via tail output and the diff
  after merge.

## Decisions

### Agent definitions

`agents.yaml` at the project root, parsed by the `yaml` package. v1 schema is
intentionally tiny:

```yaml
agents:
  - name: claude
    description: Implements tasks using Claude Code via /opsx:apply
    command: claude
    args: ['/opsx:apply', '${change_id}']
    env:                       # optional, per-agent env overrides
      ANTHROPIC_FOO: bar
```

Template variables resolved before spawn: `${change_id}`, `${worktree_path}`,
`${branch}`. Unknown variables → server returns 400, no job spawned. If
`agents.yaml` is missing or empty, the Run button is hidden and
`/api/agents/run` returns 503 with a hint to create the file.

### Worktree layout

- Location: `.worktrees/<change-id>/` at the project root.
- Branch: `agent/<change-id>` created off the current `HEAD` at the time of
  Run.
- Add `.worktrees/` to `.gitignore` as part of this change.

If the worktree already exists when Run is clicked (e.g. previous job ended
but wasn't merged), v1 rejects the Run with a 409 and a message pointing at
the existing worktree. The user must Merge or Discard first. This keeps the
state machine simple.

### Job lifecycle

```
                                      ┌──── cancelled ──┐
                                      │                  ▼
   POST /api/agents/run  ──► spawn  ──┴──► running ──► completed (exitCode)
                                              │             │
                                              └── crashed ──┘
```

- Job record: `{ id, changeId, agentName, branch, worktreePath, status, startedAt, finishedAt?, exitCode?, output: ring-buffer of lines }`.
- Output is kept as a ring buffer (last 10,000 lines per job) to bound
  memory.
- Locks: `Map<changeId, jobId>`. Acquired before spawn, released on
  completion (any status).

### Endpoints

| method | path | purpose |
|---|---|---|
| `GET` | `/api/agents/config` | returns the loaded `agents.yaml` (sanitized — env values redacted) |
| `GET` | `/api/agents/jobs` | list all jobs (active + recent history, default last 50) |
| `GET` | `/api/agents/jobs/:id` | full job detail including current output buffer |
| `POST` | `/api/agents/run` | `{ changeId, agentName }` → spawn |
| `POST` | `/api/agents/jobs/:id/cancel` | SIGTERM the running process |

All endpoints are localhost-only (same gate as `/api/pty/inject`).

### WebSocket events

```ts
type AgentEvent =
  | { type: "agent-job-started"; job: JobSummary }
  | { type: "agent-job-output"; jobId: string; chunk: string; stream: "stdout" | "stderr" }
  | { type: "agent-job-finished"; jobId: string; status: "completed" | "cancelled" | "crashed"; exitCode: number | null };
```

Broadcast on the existing `/ws` (same channel as state / docs / tags
updates). Clients filter by `type`.

### UI

- **Run button** on TODO and IN-PROGRESS kanban cards (DONE is past the
  agent's window). If `agents.yaml` is empty, button is hidden.
- **Status badge** on the card while running: pulsing dot + agent name. On
  exit, becomes "✓ ready to merge" or "✗ failed (n)".
- **Merge / Discard buttons** appear on cards whose latest job is complete:
  - Merge: `CommandModal` previews `git merge agent/<change-id>` and sends
    it via `injectPty`.
  - Discard: same pattern, sends `git worktree remove --force .worktrees/<change-id> && git branch -D agent/<change-id>`.
- **`/agents` page** with top-nav entry "Agents" between Tags and Docs:
  - Active jobs at the top with live tail.
  - Recent finished jobs below with the final output preserved.
  - Each job links to its change.

### Output tailing

Live tail uses the new WS events. Each browser maintains a per-job output
ring matching the server's. On a fresh page load the client first fetches
`/api/agents/jobs/:id` to seed the buffer, then attaches WS for new chunks.

### Process management

- Spawn with `cwd: <worktree_path>`, `stdio: ['ignore', 'pipe', 'pipe']`.
- Capture stdout/stderr in newline-aligned chunks; emit each as a WS event.
- On `process.exit`, mark the job, broadcast `agent-job-finished`, release
  the lock.
- On server shutdown (SIGINT/SIGTERM), `SIGTERM` all active processes; do
  not wait — the worktrees remain for manual recovery.

## Risks / Trade-offs

- **Process state lost on server restart.** The job registry is
  in-memory. A crash means active runs become "ghost" worktrees the user
  must clean up by hand. Mitigation: persist the registry to a tiny JSON
  file (`.worktrees/jobs.json`) — listed as a Future work item, kept out
  of v1 for simplicity.
- **Agents could `cd ..` out of the worktree.** Not preventable from the
  process side; mitigation is documentation. Trust-the-tooling model.
- **`agents.yaml` typos.** A malformed YAML breaks the whole agents UI.
  Mitigation: cache the last-known-good and surface the parse error in
  `/api/agents/config` for the UI to display banner-style.
- **`git worktree add` from inside a worktree.** Works (git allows it),
  but the user must run the server from the main worktree, not from
  inside `.worktrees/<id>/`. Document this.
- **Tail volume.** Verbose agents could flood the WS. Mitigation: the
  ring buffer caps memory at 10k lines; WS chunks are batched per process
  tick.
- **Bytes vs lines.** stdout is binary; stderr too. v1 decodes as UTF-8
  with replacement chars on invalid bytes. Good enough for the supported
  CLI tools.
- **Branch name collision.** If `agent/<change-id>` already exists from a
  prior run, we error out (409). The user discards first. Keeps semantics
  obvious.
