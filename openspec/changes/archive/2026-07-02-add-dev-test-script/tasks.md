## 1. Script

- [x] 1.1 Add `dev:test` npm script in `package.json`: `concurrently -n api,web -c blue,magenta "OPENSPEC_DEV=1 tsx server/index.ts" "npm:dev:web"`
- [x] 1.2 Place it next to the existing `dev` and `dev:server` entries so the diff surfaces obviously in code review

## 2. Docs

- [x] 2.1 Add a note to `README.md`'s Quick Start explaining when to reach for `dev:test`: "use this when you need running agents / long-lived server-side state to survive UI edits, most importantly for parallel-agent dogfooding via the IN-PROGRESS launcher"
- [x] 2.2 Cross-link `dev:test` from `docs/architecture/parallel-shells.md` at the "Launching parallel work from the UI" section

## 3. Verification

- [x] 3.1 Start `dev:test`; spawn a worktree agent via the Kanban launcher
- [x] 3.2 Edit a `web/` file to trigger HMR — server output shows no restart; agent output continues streaming
- [x] 3.3 Edit a `server/` file — no automatic restart; the agent continues running until it exits on its own or is cancelled
- [x] 3.4 Confirm the WebSocket at `/ws` connects from `http://localhost:5173/` (dev mode Origin allow-list working under `dev:test`)
- [x] 3.5 Confirm the existing `npm run dev` still restarts the server on server-file edits (contract of the default script unchanged)
