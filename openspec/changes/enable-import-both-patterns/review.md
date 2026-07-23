# Review: enable-import-both-patterns

**Round**: 2  
**Commit**: b6d6a12  
**Verdict**: pass  
**Findings**: 1 advisory (new), 0 blocking

---

## Round-1 finding status

### B1 — RESOLVED

`IPC_OPEN_PROJECT = 'ithyno:open-project'` is declared in `electron/src/preload.ts` and `openProject: (path: string) => ipcRenderer.send(IPC_OPEN_PROJECT, path)` is exposed on the `ithyno` bridge (lines 5, 35–37).

`ipcMain.on('ithyno:open-project', (_event, path: unknown) => { ... void switchProject(path); })` is registered in `electron/src/main.ts` (lines 482–485). Input validation (`typeof path !== 'string' || !path`) is present. `switchProject` exists at line 273. B1 is fully resolved.

### B2 — RESOLVED

All seven CSS classes are now present in `web/src/styles.css` (appended after line 3345):

- `.import-notifications-region` — `position: fixed; top: 72px; right: 16px; z-index: 20; display: flex; flex-direction: column; gap: 8px; max-width: 360px; pointer-events: none`
- `.imported-project-notification` — card border, border-radius, box-shadow, padding, `pointer-events: auto`
- `.imported-project-notification-body` — flex column layout
- `.imported-project-notification-title` — weight 600, 13 px
- `.imported-project-notification-path` — muted color, truncation via text-overflow: ellipsis
- `.imported-project-notification-time` — 11 px muted
- `.imported-project-notification-actions` — button row with gap; scoped `.btn-primary` / `.btn-secondary` overrides with hover states

B2 is fully resolved.

### A1 — RESOLVED

`PROJECT_ROOT` is now computed via `realpathSync` with a try/catch fallback (server/index.ts lines 55–59). `targetPath` is also resolved via `realpathSync` with a try/catch fallback before the pattern comparison (lines 1212–1214). Both sides normalized. A1 is resolved.

### A2 — RESOLVED

`setOnExpire` is exported from `server/import-jobs.ts`. The `sweepExpired` function calls `onExpire?.(id)` inside a `try/catch` for each expired job. In `server/index.ts`, `setOnExpire((jobId) => { w.stop(); importWatchers.delete(jobId); })` is registered immediately after the dynamic import resolves. The ordering is safe: `setOnExpire` completes before any request handler can call `registerImportJob` → `sweepExpired`. A2 is resolved.

### A3 — SKIPPED (documented as intentional)

Doctor-before-auth ordering is intentional per project design. Not revisited.

### A4 — RESOLVED

`pushImportNotification` now guards with `s.importedProjectNotifications.some((x) => x.id === n.id)` before appending (web/src/store.ts lines 337–341). Duplicate events for the same `jobId` produce no duplicate store entry. A4 is resolved.

---

## New findings

### N1 — Advisory: `_clearImportJobsForTest` does not reset `onExpire`; future tests could observe leaked callback

**File**: `server/import-jobs.ts` line 94–96

`_clearImportJobsForTest()` clears `registry` but leaves the module-level `onExpire` singleton intact. If a future test calls `setOnExpire(mockFn)` and then `_clearImportJobsForTest()` to reset between tests, the mock callback persists into subsequent tests, causing spurious mock invocations during the TTL sweep test (line 60 of import-jobs.test.ts).

Today this has no impact because the existing test suite never calls `setOnExpire`. The risk is confined to future tests. The fix is a one-liner:

```ts
export function _clearImportJobsForTest(): void {
  registry.clear();
  onExpire = null;
}
```

**Severity**: advisory — no current test failure; guard against future test pollution.

---

## Non-findings (fresh pass)

- **`btn-sm` on notification buttons**: `ImportedProjectNotification.tsx` uses `className="btn-primary btn-sm"`. No global `btn-sm` rule exists, but `.imported-project-notification-actions .btn-primary` scoping applies regardless of the extra class. Sizing (padding 5 px 12 px, font-size 12 px) is handled by the scoped rules. Cosmetically inert.
- **`setOnExpire` call ordering**: The IIFE calls `setOnExpire(...)` synchronously after the dynamic import resolves. No request handler can run before the IIFE completes (`await`-ed at module evaluation). Safe.
- **`isBrowserFallback()` in Electron**: With `openProject` now exposed on the preload, `isElectronShell() && typeof w.ithyno?.openProject === "function"` evaluates to `true`, so `isBrowserFallback()` returns `false`. Button label is "Open imported project" as intended.
- **WS event routing (Pattern B)**: `import-completed` with `pattern === "B"` routes to `get().load()` + `setBrowseMode(false)`. Unchanged from prior; no regression.
- **Pattern A watcher cleanup on completion**: On GENERATED.md detection, the callback calls `deleteImportJob(jid)` + `importWatchers.delete(jid)`. On TTL expiry, `setOnExpire` callback calls `w.stop()` + `importWatchers.delete(jobId)`. Both cleanup paths are complete.
- **All round-1 non-findings still hold** (watcher lifecycle, cap atomicity, awaitWriteFinish, etc.).
