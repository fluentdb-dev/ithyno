# Tasks

## 1. Doctor module

- [x] 1.1 New `server/doctor.ts`. Export types:
  ```ts
  export type Cli = "claude" | "codex" | "agy" | "copilot" | "gemini" | "opencode" | "cursor" | "antigravity";
  export type CliStatus = { installed: boolean; version?: string; path?: string; error?: string };
  export type DoctorReport = {
    agents: Record<Cli, CliStatus>;
    tmux: CliStatus;
    agmsg: CliStatus;
    readyForManager: boolean; // true when ≥1 agent CLI is installed
    checkedAt: string; // ISO
  };
  ```
- [x] 1.2 `checkCommand(cmd: string, versionArg: string): Promise<CliStatus>` — bounded subprocess (2s timeout), parses version regex, resolves path via `which <cmd>`. Rejects non-zero exit gracefully.
- [x] 1.3 `runDoctor(): Promise<DoctorReport>` — parallel `Promise.all` over agents + tmux + agmsg. `agmsg` presence checks `$HOME/.agents/skills/agmsg/scripts/send.sh` file existence (not a CLI), consistent with existing `bundle-agmsg-in-electron`.
- [x] 1.4 `agy` needs special handling — antigravity client. Version cmd may be `agy --version` or `agy version`; find the right one via docs and hardcode. (Implemented both as separate entries: `agy --version` for the `agy` key, `agy version` for the `antigravity` key.)

## 2. HTTP endpoints

- [x] 2.1 `GET /api/doctor` in `server/index.ts`. Session-token authed. Returns 200 with `DoctorReport`.
- [x] 2.2 `POST /api/doctor/install` — body `{ tool: "tmux" | "agmsg" }`. Reject anything else with 400.
  - For `tool: "tmux"`: detect package manager (macOS: brew; Linux: apt-get / dnf / pacman), invoke it, stream stdout via SSE (single job, cancellable). On unknown platform, return 400 with a docs pointer.
  - For `tool: "agmsg"`: invoke the existing `ensureAgmsgInstalled` (or its equivalent for the running mode).
  - Job lifecycle: spawn → stream → close on subprocess exit. Cap at 5 minute timeout; kill on timeout.
- [x] 2.3 Both endpoints get regression tests (`server/doctor.test.ts`).

## 3. CLI subcommand

- [x] 3.1 In `bin/ithyno.js` (ithyno's CLI entrypoint), add `doctor` subcommand. Runs `runDoctor()` via `bin/_doctor-runner.ts` and prints a formatted table.
- [x] 3.2 Exit code: 0 when `readyForManager === true`, 1 otherwise.
- [x] 3.3 Add `--json` flag that dumps the raw `DoctorReport` JSON for scripting.

## 4. Settings UI

- [x] 4.1 In `web/src/pages/Settings.tsx`, add a "Prerequisites" `<section>` at the top (above Appearance).
- [x] 4.2 On page mount, fetch `/api/doctor` and render a table:
  - column: name (claude, codex, agy, copilot, gemini, opencode, cursor, tmux, agmsg)
  - column: status (green check / red x)
  - column: version + path
  - column: action (empty for agents; [Install] button for tmux + agmsg when missing)
- [x] 4.3 Clicking [Install]: opens a `<PrereqInstallModal />` (new component) that streams the SSE install progress + shows the outcome.
- [x] 4.4 After successful install, refetch `/api/doctor` and re-render.
- [x] 4.5 CSS additions in `web/src/styles.css` for the prereq table + modal.

## 5. WS event on install completion

- [x] 5.1 When an install job completes, broadcast a `doctor-updated` WS event. The dashboard subscribes and refetches `/api/doctor`. Store updated in `store.ts`; `doctor-updated` added to `ServerEvent` union.

## 6. Tests

- [x] 6.1 `server/doctor.test.ts` — mock subprocesses for `checkCommand`, assert version + path parsing.
- [x] 6.2 `server/doctor.test.ts` — 400 on invalid install tool, session-token gating.
- [x] 6.3 `web/src/pages/Settings.test.ts` — prerequisites section renders + install click triggers modal.

## 7. Verification

- [x] 7.1 `npm run openspec -- validate add-doctor-and-installer --strict` passes.
- [x] 7.2 `npm test` passes.
- [x] 7.3 `npm run typecheck` passes.
- [x] 7.4 `npm run build` passes.
- [ ] 7.5 Manual: `ithyno doctor` prints a report; exit 0 when claude is installed, exit 1 when none are.
- [ ] 7.6 Manual: Settings page shows prerequisites; [Install] tmux on a mac without tmux shells out to brew and shows live output.
- [x] 7.7 Write `openspec/changes/add-doctor-and-installer/outcome.md`.
