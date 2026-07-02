---
tags: [feature/dev-experience, feature/agent-runner, area/scripts]
---

## Why

`npm run dev` invokes `tsx watch server/index.ts`, which restarts the
Fastify server on every server-side `.ts` edit. On restart, the SIGINT/
SIGTERM handler calls `agentRunner.shutdown()`, which SIGTERMs every
live child process — **including running worktree agents**.

The consequence: **you cannot dogfood the parallel-agent launcher
(`add-parallel-start-launcher`) with `npm run dev` running.** Any
inadvertent server-file edit — even a `console.log` in `runner.ts` —
kills every agent mid-implementation and leaves orphan `.worktrees/`
plus dangling `agent/*` branches. The dashboard has no UI to recover
those (the runner's job memory is also wiped by the restart), so cleanup
falls to raw git commands.

We landed the launcher expecting the parallel dogfood to be a productive
use of the dashboard. Without a script that runs the server **without
watch**, that productivity is theoretical. This change closes that gap.

## What Changes

Add a new npm script pair for the "dogfood" scenario:

- **`dev:test`** — starts the server via the built artifact (or a
  once-off `tsx` invocation) *without* `--watch`, alongside the existing
  Vite web dev server (HMR intact for the UI).
- The existing **`dev`** is unchanged and remains the default for daily
  iteration where server changes are being made.

The default `dev` script keeps the full watch-server + watch-web pair
because that is the correct behavior when actively developing the
server. The new `dev:test` is chosen deliberately when the goal is
**"exercise the running app"** — most importantly, dogfooding parallel
worktree agents.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `build-system`: adds a "run the app for testing" script alongside the
  existing developer-loop scripts, so parallel-agent workflows are not
  destroyed by inadvertent server-file saves

## Impact

- **`package.json`** — one new script entry (and possibly one small
  helper script line depending on the implementation choice; see
  design.md).
- **No source changes.** The server code, the agent runner, and the
  watcher are untouched.
- **Docs** — update `docs/migration-guide.md` (or the section that
  documents `npm run dev`) with a one-line note: "use `npm run dev:test`
  when running the parallel-agent launcher, so server restarts don't
  kill your agents."

## Out of scope

- **Detaching agent child processes** so they survive server restart.
  Interesting but invasive (stdio piping breaks, orphan-process concerns
  on restart). Out of scope for this change; see the follow-up idea
  `2026-07-01-agent-process-detachment` if we ever pursue it.
- **Auto-recovery of orphan `.worktrees/`** — belongs in the
  yet-to-be-proposed `add-orphan-worktree-recovery` change, not here.
- **A `watch:server:ignore` variant** that watches server but skips
  `server/agents/**`. Considered and rejected in design.md — too clever
  and brittle.
