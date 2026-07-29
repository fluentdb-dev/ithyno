# Design: respawn-manager-pty-on-project-switch

## Server-side state model

Today: `PROJECT_ROOT` is captured once at module load.

```ts
// server/index.ts:68 (today)
const PROJECT_ROOT = (() => {
  const resolved = resolve(process.env.ITHYNO_PROJECT_ROOT ?? process.cwd());
  ...
})();
```

Proposed: promote to a mutable module-level variable behind a getter
so all callers see the current value.

```ts
// server/index.ts (proposed)
let currentProjectRoot = resolveInitialProjectRoot();
export function getProjectRoot(): string { return currentProjectRoot; }

function setProjectRoot(next: string) {
  currentProjectRoot = next;
  openspecDir = resolveOpenspecDir(currentProjectRoot);
}
```

All 40+ call sites that read `PROJECT_ROOT` today become
`getProjectRoot()` reads. Grep target list — enforced by a `no-restricted-syntax`
lint rule or a smoke test that greps for `PROJECT_ROOT` as identifier.

Alternative rejected: pass PROJECT_ROOT through parameters everywhere.
Too invasive; the constant is read in dozens of handlers across
sidecar, needs-human, watcher, git-status, agents.yaml load. A
getter preserves the API shape.

## PTY lifecycle on project switch

```
POST /api/project/switch { projectRoot: "/new/path" }
  ↓
1. validate path (absolute, exists, is dir, authorized)
2. terminate live PTYs — walk server/sync/pty.ts `live` array,
   for each entry: entry.term.kill(); entry.ws.close(1000, "project switch")
3. setProjectRoot(newPath) — updates module var + openspecDir
4. broadcast WS state-replaced (existing broadcaster)
5. return 200 { projectRoot }
```

Client-side: dashboard receives state-replaced, refetches state via
`/api/state`, sees the new root, terminal panel's Terminal component
sees the WS close and its existing reconnect logic
(`add-terminal-reconnect`) opens a fresh `/pty` connection. New
connection arrives at line 1692 in `server/index.ts` — reads current
`getProjectRoot()`, spawns PTY at NEW cwd.

## Race: mid-switch PTY spawn

Scenario: client A's PTY is still terminating while client B initiates
a fresh WS connection. B's `attachPtyToSocket` call reads the new
project root and spawns at the correct cwd. A's cleanup finishes
after. No race — the switch is sequential per project switch call.

Scenario: two `POST /api/project/switch` calls arrive nearly
simultaneously. Add a switch-in-progress flag; second call gets 409
`{ error: "project switch already in progress" }`. Simple guard.

## Session-id continuity

`resolveClaudeSessionStartup(projectRoot)` in `server/sync/pty.ts`
reads/writes `<projectRoot>/.ithyno/session-claude`. When project
switches from A to B:

- A's session file at `A/.ithyno/session-claude` untouched
- B's session file: if exists → resume that session, else mint fresh

Correct behavior. No cleanup needed for A's session file — it's
project-owned state.

## Electron adjustment

Today `switchProject(picked)` in `electron/src/main.ts` respawns the
whole Node server subprocess with `--dir <picked>`. This causes:
- port re-bind race (occasional EADDRINUSE)
- brief window blank flicker
- WS reconnection dance

Proposed: replace the respawn with a POST to
`/api/project/switch`. The server stays up, PTY reboots in-place.

Backward compat: keep the CLI `--dir <path>` flag for initial launch
(that's the boot-time PROJECT_ROOT). Runtime switch is via endpoint
only.

## VS Code extension

The extension currently has an "Open Folder" command that changes VS
Code's workspace. When the workspace changes, the extension emits its
own postMessage to the ithyno webview. Extend that postMessage to also
call `/api/project/switch` so the ithyno server updates its
PROJECT_ROOT to match VS Code's active workspace root.

## Authorization

`/api/project/switch` inherits the same path allow-list logic as
`/api/import/spec-generation` (unauthorized paths → 403). The user's
home directory subtree is authorized; system paths (`/usr`, `/etc`,
`/System`, `/private`, `/var`, `/Library`) are blocked.

## Testing

- Unit: `setProjectRoot` updates the module var + `openspecDir`.
- Integration: mock a WS lifecycle — connect, `setProjectRoot`,
  simulate reconnect, assert new PTY spawns with new cwd.
- Regression: existing PTY tests pass unchanged (cwd is still passed
  explicitly to `attachPtyToSocket`).
