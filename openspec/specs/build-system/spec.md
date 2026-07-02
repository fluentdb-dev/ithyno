# build-system Specification

## Purpose
TBD - created by archiving change add-dev-test-script. Update Purpose after archive.
## Requirements
### Requirement: Test-Run Script Preserves Agent Processes
The project SHALL provide an npm script `dev:test` that starts the
Fastify server without `tsx --watch` while keeping Vite's web-side HMR,
so long-running child processes spawned by the agent runner (worktree
agents, embedded PTY sessions) are not killed by inadvertent server-file
saves during UI or dogfood testing.

#### Scenario: Script exists
- **WHEN** the developer runs `npm run dev:test`
- **THEN** the server starts via `tsx server/index.ts` (no `--watch` flag) and the Vite web dev server (`npm:dev:web`) starts in parallel

#### Scenario: Server survives UI edits
- **WHEN** the developer is running `dev:test` and edits a file under `web/` that triggers a Vite HMR update
- **THEN** the server process is unaffected and any live worktree agents continue running

#### Scenario: Server does not restart on server-file edits
- **WHEN** the developer is running `dev:test` and edits a file under `server/`
- **THEN** the server process does not restart automatically; the change is picked up only on the next manual restart

#### Scenario: Dev-mode Origin allow-list is on
- **WHEN** `dev:test` starts the server
- **THEN** the server runs with `OPENSPEC_DEV=1` so the WebSocket upgrade from `http://localhost:5173` (Vite dev) is permitted, matching the existing `dev` script's behavior

#### Scenario: Default dev script is unchanged
- **WHEN** the developer runs `npm run dev`
- **THEN** the server runs with `tsx watch` as before (server-file edits restart the process), preserving the actively-editing-server workflow

