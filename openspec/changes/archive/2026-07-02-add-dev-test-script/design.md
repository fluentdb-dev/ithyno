## Context

The dashboard's parallel-agent story (worktree spawn + agent-runner +
Kanban launcher) is complete. It's also destroyed by any server-file
save under `npm run dev`, because `tsx watch` restarts the server, whose
shutdown handler SIGTERMs every child agent.

We need a "run the app without touching the server code" mode that
preserves web HMR (so UI iteration is still fast) but keeps the server
alive across UI-side edits.

## Goals / Non-Goals

**Goals:**
- Run the server without `--watch` so agent processes survive UI-side
  code changes and browser refreshes
- Keep Vite's HMR for the web UI so front-end iteration is unaffected
- Zero source-code changes; script-only
- Discoverable name (`dev:test`) that pairs with the existing `dev`

**Non-Goals:**
- Detach agents from the server process (see out-of-scope)
- Replace `dev` as the default; the current watch-server pair is right
  for the "actively editing the server" workflow
- Any change to server startup semantics, logs, or ports

## Decisions

### Naming: `dev:test`

Rejected alternatives:
- **`dogfood`** — evocative but jargony; the reason we want this script
  is broader than just dogfood (any long-running UI interaction that
  must not lose the server benefits)
- **`dev:live`** — ambiguous vs the existing `dev`
- **`dev:stable`** — suggests something about correctness, not the
  actual difference (watch vs no-watch on the server)
- **`dev:agent`** — narrows too much; the script also helps embedded
  terminal sessions, WS reconnection debugging, etc.
- **`start:dev`** — collides with the existing `start` convention
  (production entry point) and would confuse

`dev:test` — the `test` suffix reads as "run the app to test features
end-to-end," which matches the intent. It's a distinct namespace from
the vitest-driven `test` script (which stays as-is).

### Implementation: server via built artifact vs. `tsx` once-off

**Choice: `tsx` once-off.**

```json
"dev:test": "concurrently -n api,web -c blue,magenta \"OPENSPEC_DEV=1 tsx server/index.ts\" \"npm:dev:web\""
```

Rationale:
- Requires **no build step** — the script "just works" after a fresh
  `npm install`, matching the ergonomics of the existing `dev`.
- Uses the same `tsx` runtime as `dev:server`, so there is no runtime
  or import-resolution divergence to debug when this mode misbehaves.
- Leaves the production-run path (`npm start` → built artifact) as the
  distinct thing it should be.

Rejected: `concurrently … "npm run start" "npm run dev:web"`. This
requires `npm run build:server` first, adds a build-artifact caching
question, and means the source-of-truth for what the server is running
depends on when you last built. Not worth it for a developer-facing
script.

### Environment: keep `OPENSPEC_DEV=1`

The Vite dev port 5173 needs to be in `ORIGIN_ALLOW` for WS upgrade to
succeed under `dev:test` (same as `dev`). The existing
`OPENSPEC_DEV=1` env var already flips that gate on. Reuse it verbatim.

### Rejected alternative: watch server but ignore agents/

```json
"dev:server:careful": "tsx watch --ignore='./server/agents/**' server/index.ts"
```

Rejected reasons:
- **Fragile.** Any other file edit still restarts the server and kills
  agents. That's just as bad as today, only harder to reason about.
- **Wrong knob.** The problem is not "which files trigger a restart" —
  it's "should a restart kill running agents at all." That question
  belongs to agent-process detachment (a separate, larger conversation).
- **Silently misleading.** Users would expect `agents/` edits to be
  picked up but they wouldn't; the wrong contract.

## Alternatives considered

- **Documentation only** — tell users to run `tsx server/index.ts`
  manually when they want stable agents. Rejected: not memorable, easy
  to forget, defeats the point of npm scripts as ergonomic wrappers.
- **Detach agent processes.** See the Out-of-scope section in the
  proposal — separate, larger design work.
- **Make `dev` never restart on `agents/**/*` changes.** Silent contract
  change to `dev` — bad. Users editing the runner deserve to see their
  edits picked up.

## Risks

- **Confusion**: users may run `dev:test` when they should run `dev`,
  then wonder why their server-side edits are not being picked up. Mitigate
  with docs and by keeping the name clearly test-oriented.
- **Drift**: `dev` and `dev:test` share the web half but diverge on the
  server half. If one grows a flag (e.g. `OPENSPEC_PORT`), the other
  needs to grow it too. Keep them together in `package.json` so drift
  is obvious in diffs.
