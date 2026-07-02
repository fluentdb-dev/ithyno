# Outcome — add-dev-test-script

## ✅ Worked

- One-line addition to `package.json`: `dev:test` invokes
  `concurrently -n api,web -c blue,magenta "OPENSPEC_DEV=1 tsx server/index.ts" "npm:dev:web"`.
  No build step needed, no source-code changes anywhere.
- The default `dev` script stayed as-is, so nobody's daily loop was
  disturbed. `dev:test` is opt-in for the "exercise the running app"
  scenario.
- `README.md`'s Quick Start and `docs/architecture/parallel-shells.md`
  both got the "use dev:test for parallel-agent dogfood" note, so the
  script is discoverable without having to read `package.json`.

## ⚠️ Surprises

- No real surprises during implementation — the script is a single
  concurrently invocation, tsx handles imports the same way whether
  `--watch` is on or off.
- The actual value showed up on first use: mid-agent-run edits to
  `server/index.ts` under regular `dev` used to kill the agent; under
  `dev:test` the agent kept running, exactly as designed.

## 🔁 Differently

- Considered a `dev:server:careful` variant that watches server but
  ignores `server/agents/**` — rejected in design.md because it made
  the "which files restart the server" contract fragile. That call
  held up in practice: the yes/no binary of `dev` vs `dev:test` is
  easier to reason about than a partial-watch middle ground.

## 🌱 Follow-ups

- The `agent-process-detachment` idea (detaching agent child processes
  so they survive server restart) is a bigger design task that this
  change explicitly deferred. Proposed as `add-agent-process-detach`
  and still in flight — that's the "proper fix" for the underlying
  problem; `dev:test` is the pragmatic workaround.
- `add-orphan-worktree-recovery` would let the dashboard clean up
  stray `.worktrees/` from crashes — landed as
  `add-orphan-worktree-adoption`, closing a chunk of this change's
  original motivation ("cleanup falls to raw git commands").
