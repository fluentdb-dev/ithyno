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

Proposed: a `let currentProjectRoot` behind a `getProjectRoot()` getter.

```ts
// server/index.ts (proposed)
let currentProjectRoot = resolveInitialProjectRoot();
function getProjectRoot(): string { return currentProjectRoot; }

function setProjectRoot(next: string): void {
  currentProjectRoot = next;
  openspecDir = resolveOpenspecDir(currentProjectRoot);
}
```

In-file callers that today read `PROJECT_ROOT` become
`getProjectRoot()` reads. Some callers are hot paths (`/api/state`,
`/pty` upgrade handler); the getter is a single field read, no cost.

`openspecDir` is already mutable from `refactor-import-to-task-tool-subagent`
— `setProjectRoot` reuses the same machinery.

## PTY lifecycle on project switch

```
POST /api/project/switch { projectRoot: "/new/path" }
  ↓
1. validate path (absolute, exists, is dir, authorized via existing allow-list)
2. terminateAllLivePtys() — walks server/sync/pty.ts `live` array,
   for each: entry.term.kill(); entry.ws.close(1000, "project switch")
3. setProjectRoot(next) — updates module var + openspecDir
4. broadcast WS state-replaced (existing broadcaster)
5. return 200 { projectRoot: next }
```

Client-side: dashboard receives state-replaced → refetches
`/api/state` → sees new root. Terminal component's existing reconnect
logic (`add-terminal-reconnect`) opens a fresh `/pty` connection.
New connection arrives at line ~1692 in `server/index.ts` — reads
current `getProjectRoot()`, spawns PTY at NEW cwd.

## Concurrency

A module-level `switchInProgress: boolean` flag. Second call while
first is in-flight → 409. Cleared in `finally` so error paths don't
leave it stuck.

## Authorization

`/api/project/switch` reuses the path allow-list logic already used by
`/api/import/spec-generation` — reject paths under `/usr`, `/etc`,
`/System`, `/private`, `/var`, `/Library`.

## Out of scope

Explicitly deferred (see proposal.md Non-goals):
- Electron `switchProject()` respawn removal
- VS Code workspace folder listener wiring
- Dashboard UI trigger

These are legitimate follow-ups but not part of the root fix. Each
can be its own small change once the endpoint exists.
