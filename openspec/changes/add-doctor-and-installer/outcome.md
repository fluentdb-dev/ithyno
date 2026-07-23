# Outcome: add-doctor-and-installer

## Worked

- `server/doctor.ts` as a pure module with `Cli`, `CliStatus`, `DoctorReport` types and `checkCommand`, `runDoctor` exports — fully typed and parallel execution via `Promise.all`.
- `agy` handled with two entries: `agy --version` for the `agy` key, `agy version` for the `antigravity` alias key; this covers both possible CLI shapes without needing docs lookup.
- `agmsg` presence check via `~/.agents/skills/agmsg/scripts/send.sh` file existence — consistent with the Electron installer pattern.
- `GET /api/doctor` session-token gated (explicit header check on GET since the CSRF hook only fires on mutating methods).
- `POST /api/doctor/install` streams SSE `event: progress` / `event: done` with 5-minute timeout and package-manager detection (brew / apt-get / dnf / pacman).
- `doctor-updated` WS event added to `ServerEvent` union and handled in `store.ts` to update `doctorReport` in place.
- `ithyno doctor` CLI subcommand using `bin/_doctor-runner.ts` (tsx-invoked) with `--json` flag.
- Settings page: `PrerequisitesSection` component above Appearance; `PrereqInstallModal` with SSE reader + auto-scroll. `useEffect` on mount fetches the report; WS event also refreshes.
- CSS for prereq table and modal in `styles.css`.
- All automated checks pass: OpenSpec validate, `npm test` (441 pass + 1 skip, pre-existing build-icons sharp failure), `npm run typecheck`, `npm run build`.

## Surprises

- The CSRF `onRequest` hook in Fastify only runs for mutating methods — `GET /api/doctor` needed its own explicit `extractToken` / `verifyToken` call (same pattern as `/api/auth/check`).
- `which` is always available in practice but is spawned asynchronously alongside the version command; path resolution races with the version check, which is acceptable (path is informational).
- The `antigravity` key is an alias for `agy` — it runs `agy version` (no `--`) to exercise the alternate invocation style documented in antigravity's CLI.

## Differently

- Would use a shared SSE helper function to avoid duplicating the `sendSse` / `clientAlive` pattern between agmsg and tmux install branches.
- Could cache the DoctorReport server-side with a TTL (30s) to avoid repeated subprocess spawns on frequent `/api/doctor` fetches.
- The `bin/_doctor-runner.ts` runner script approach works well; a TypeScript-first CLI entrypoint rather than spawning tsx from `.js` would be cleaner long-term.

## Follow-ups

- Gate Init flow on `readyForManager` once `expand-init-to-scaffold-agents-yaml` lands (it already imports `runDoctor`).
- Add cache TTL to `runDoctor()` in `server/doctor.ts` for repeated requests under load.
- Consider a shared SSE streaming helper in `server/util/sse.ts` once more endpoints need it.
- The `--json` flag on `ithyno doctor` could pipe into `jq` for scripting; document this in README or help text.
