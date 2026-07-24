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

---

## Rework round 2

Addressed 6 findings from review round 1 (F1–F5 + F7; F6 was info-only, no action needed).

**F2 (medium) — cpSync partial install:** Changed `force: false` to `force: true` in the agmsg `cpSync` call (`server/index.ts`). Added a comment explaining why. Added a regression test in `doctor.test.ts` that proves `force: true` overwrites a stale partial install and that `force: false` leaves it broken.

**F1 (low) — whichProc leak:** Changed `whichProc` to `let` with an `undefined` initial value so `settle()` can close over it. `settle()` now calls `whichProc?.kill()` before resolving, preventing the subprocess from writing to the closed-over `resolvedPath` after the outer Promise settles. The `?.` guard handles the narrow window before the spawn returns.

**F3 (low) — readyForManager comment contradiction:** Removed `antigravity` from `AGENT_KEYS` (was comment-contradicting double-counting of `agy`). Updated the comment to explain the exclusion. Updated the corresponding test to use the same primary key list.

**F4 (low) — Windows which comment:** Added an inline comment on the `spawn("which", ...)` line noting that `which` is unavailable on Windows (equivalent is `where`) and that path resolution silently yields `undefined` there, affecting only the `path` field in the report.

**F5 (low) — SSE reader cancel on unmount:** Hoisted `reader` to `activeReader` in the outer `useEffect` closure scope. The cleanup function now calls `activeReader?.cancel().catch(() => {})` so the underlying fetch stream is released immediately on unmount rather than waiting for GC.

**F7 (low) — test coverage:** Added two new describe blocks to `doctor.test.ts`: (1) `"400-path guard rejects every non-installable value"` — mirrors the exact `tool !== "tmux" && tool !== "agmsg"` guard, covering 14 invalid inputs and the 2 valid ones; (2) `"agmsg install cpSync force:true (F2 regression)"` — two tests using real `cpSync` calls on temp directories to document both the fixed and old broken behaviour.

All checks pass after rework: `npm run openspec -- validate add-doctor-and-installer --strict` (VALID), `npm test` (444 pass + 1 skip, pre-existing sharp failure), `npm run typecheck` (clean), `npm run build` (clean).
