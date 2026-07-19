---
tags: [feature/electron, feature/vscode-extension, area/server]
---

# Parallel shells: Electron + VS Code extension

ithyno's north-star is **UI-driven parallel agent execution in
isolated git worktrees**. The two shell-packaging changes
(`add-electron-shell`, `add-vscode-extension`) are the first real-world
test of that workflow: both are independent in scope, both want to land,
and both can run as separate agents in separate worktrees thanks to
`add-agent-runner`.

This document explains the moving parts and where to look.

## The three changes

| change | role |
|---|---|
| `prep-parallel-shells` | **This change.** Lays down workspaces, the `build:server` script, and gitignore entries so the two parallel runs do not collide on the root `package.json`. |
| `add-electron-shell` | Adds `electron/` — a desktop app shell that spawns the existing server and loads it in a BrowserWindow. Embedded terminal stays. |
| `add-vscode-extension` | Adds `vscode-extension/` — an extension that spawns the server and loads it in a webview, delegating the terminal to VS Code's terminal panel. |

## Shared substrate (already in place)

- `bin/ithyno.js` — both shells spawn this.
- `add-csrf-protection` — both shells consume the session-token launch URL.
- `add-agent-runner` — both shells will themselves be implemented by agents
  running in `.worktrees/add-electron-shell/` and
  `.worktrees/add-vscode-extension/`.

## Why this preparation exists

Before this change, both shell proposals quietly assumed they'd be the
only one adding `electron/` (or `vscode-extension/`) to the root
`workspaces` array. The first to merge wins; the second's `git merge`
hits a conflict on a single line. Pre-staging both entries up-front
removes that contention.

## Agents run inside a PTY

Every agent spawned by the runner runs inside a real pseudo-terminal
(via the same `node-pty` binding the embedded terminal uses). TTY-detecting
CLIs (Claude Code, Aider, Codex) enter their normal interactive modes
under this setup; without the PTY they detect "no TTY" and either
degrade to non-interactive mode or idle silently on stdin. Landed by
[add-agent-pty-runner](../../openspec/changes/add-agent-pty-runner/).

Consequences:
- stdout and stderr merge into one stream (that's how PTYs work). The
  runner tags all PTY output as `stream: "stdout"` in the ring buffer;
  `"stderr"` remains in the schema for hypothetical non-PTY producers.
- ANSI escape sequences (colors, cursor motion) land in the buffer raw
  and are interpreted at render time.
- `writeInput` sends `\r` on Enter (a terminal's Enter byte), not `\n`.
  The child's line discipline converts it to `\n` as usual.
- No YOLO / `-p` flags are needed *just to make the CLI run*. Users may
  still add them for permission auto-approval — those are orthogonal.

## Orphan worktrees are adopted on server startup

Restarting the server no longer strands the `.worktrees/` on disk. On
startup the runner reads `git worktree list --porcelain`, keeps
entries under `.worktrees/<change-id>/` with branch `agent/<change-id>`,
and inserts each as a synthetic job with `status: "orphaned"`. The
Kanban card renders the change with an `Orphaned` badge and the
familiar Merge / Discard actions — Cancel is hidden because there is
no process to signal. Landed by
[add-orphan-worktree-adoption](../../openspec/changes/add-orphan-worktree-adoption/).

## Live progress from the worktree

Agents running under Claude Code's `-p` (print) mode produce no PTY
output until they exit — the transcript stays silent for the entire
implementation window. To keep the Kanban card's progress bar honest
while the agent works, the runner starts a per-job filesystem watcher
on the worktree's `openspec/changes/<id>/tasks.md`. Every `[x]` tick
becomes a `worktree-progress-updated` WebSocket event; the card's
`N/M` count moves in real time regardless of what the PTY does or
does not print. Landed by
[add-worktree-tasks-watcher](../../openspec/changes/add-worktree-tasks-watcher/).

## Feeding agents their first task via stdin

`agents.yaml` entries may declare an `initialInput` string that is
written to the agent's stdin at spawn time. This is the portable way to
hand a REPL-style CLI its opening prompt — every CLI that reads stdin
accepts it. Per-CLI print flags (`claude -p`, `aider --message`) work
too but are named differently by each tool and change between releases;
stdin is the Unix contract we can bet on. Landed by
[add-agent-initial-input](../../openspec/changes/add-agent-initial-input/).

## Answering agent prompts from the UI

Each running job's output is rendered through an **interactive xterm.js
terminal** on the Agents page (landed by
[add-agent-xterm-output](../../openspec/changes/add-agent-xterm-output/)).
Colors, spinners, and cursor motion render correctly, and **user
keystrokes** (arrow keys, Enter, Tab, Ctrl-C, printable characters)
flow straight to the agent's PTY via
`POST /api/agents/jobs/:id/input` — exactly as they would in a
directly-attached terminal. Claude Code's arrow-key option selectors,
Aider's `y/N`, Codex confirmation prompts all work from the browser.

If you'd rather skip prompts entirely, add the tool's YOLO flag to
`args` in `agents.yaml` (worktree isolation is the safety net).

## Launching parallel work from the UI

**Use `npm run dev:test` (not `npm run dev`)** when dogfooding this. `dev`
runs the server under `tsx watch`, which restarts on any server-file save
and SIGTERMs every child agent along with it. `dev:test` runs the server
once and keeps web HMR. Landed by
[add-dev-test-script](../../openspec/changes/add-dev-test-script/).

The Kanban IN-PROGRESS column exposes a **`Start ▾ (N)`** launcher in its
header (mirrors TODO's `+ New Change`). Landed by
[add-parallel-start-launcher](../../openspec/changes/add-parallel-start-launcher/).
It lists every startable change (has non-verify work, not running, agents
available) so users can start a second/third change alongside a running one
without leaving the progress column.

- Candidate predicate: `startableCandidates()` in `web/src/util/changeState.ts`,
  shared with the card-level Start gate.
- Dispatch: reuses `useStartFlow().startImplementation` — same ExecutionPicker
  and same worktree/terminal branches as the card-level Start.
- Concurrency: no queueing. If the user picks 3, 3 agents spawn.

## The Claude default agent auto-commits at end-of-apply

`agents.yaml`'s bundled Claude entry runs `/ithy-opsx:apply
${change_id}` instead of `/opsx:apply`. The wrapping skill
(`.claude/skills/ithy-opsx-apply/SKILL.md`) delegates to the upstream
apply flow and then adds a single `git commit` at the end so the agent
branch ends with the implementation recorded — not sitting as a dirty
tree waiting for the archive skill's safety net to notice. Two commits
per completed change: one for implementation (via merge), one for the
archive move. Landed by
[add-ithy-opsx-apply](../../openspec/changes/add-ithy-opsx-apply/).

## Archiving as a single git commit

The Kanban DONE column's Archive button injects **`/ithy-opsx:archive
<id>`** in Claude mode (CLI mode still uses `npx openspec archive
<id>`). The Claude command follows the
[`ithy-opsx-archive`](../../.claude/skills/ithy-opsx-archive/SKILL.md)
skill, which handles the full flow: preflight, optional worktree merge
(`git merge --no-ff agent/<id>`), `openspec archive`, and one auto-drafted
git commit the user reviews before it lands. Landed by
[add-ithy-opsx-archive](../../openspec/changes/add-ithy-opsx-archive/).

## Viewing the worktree from the dashboard

While an agent job runs, the change lives in two places on disk: the
main tree at `openspec/changes/<id>/` (the frozen proposal) and the
worktree at `.worktrees/<id>/openspec/changes/<id>/` (the agent's
in-flight edits). The dashboard reads either version based on the
URL. Adding **`?tree=worktree`** to a change URL — e.g.
`/change/add-vscode-extension?tree=worktree` — makes the server
return the worktree copy, and the ChangeDetail head shows a "viewing
worktree · switch to main" pill for the return trip. Kanban cards
whose job is running link to the worktree URL automatically, so the
card's progress ticks and the ChangeDetail page stay in sync. When
the worktree disappears (job discarded, worktree removed manually),
the `?tree=worktree` URL degrades to the main-tree view with a small
notice. Landed by
[add-worktree-change-view](../../openspec/changes/add-worktree-change-view/)
(archived).

## Reading order

For someone new joining the parallel-shells story:

1. [Electron folder layout idea](../ideas/2026-06-29-electron-shell-folder-layout.md)
2. [add-electron-shell proposal](../../openspec/changes/add-electron-shell/proposal.md)
3. [add-vscode-extension proposal](../../openspec/changes/add-vscode-extension/proposal.md)
4. [add-agent-runner spec](../../openspec/changes/archive/) (once archived) or
   [add-agent-runner](../../openspec/changes/add-agent-runner/) while in flight
5. [add-parallel-start-launcher](../../openspec/changes/add-parallel-start-launcher/) for the UI launcher
