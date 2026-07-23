# Outcome: refactor-import-to-task-tool-subagent

## Worked

- **Server rewrite**: `server/import-spec-gen.ts` cleanly excised all subprocess spawn code — `spawn('claude', ['-p'])`, `10-min timeout`, `SIGKILL grace`, `jobs` Map, LRU eviction, `subscribeToJob`, `JobState`, and the SSE keeper. The file is now ~130 lines (down from ~470), exporting only `preflight` and the new `injectImportCommand`.
- **PTY inject mechanism**: `injectImportCommand` delegates directly to `injectIntoActive` (already imported in `server/index.ts`). The inject is synchronous and the 503 path is clear — when no PTY is live, `injectIntoActive` returns `{ ok: false, reason: "No embedded terminal..." }`, which maps to 503.
- **`generatedMarkerPresent` field**: Added non-breakingly to `WorkspaceState` in `server/model.ts`, `server/parser/workspace.ts`, and `web/src/types.ts`. The scanner reads `existsSync(join(projectRoot, "openspec", "GENERATED.md"))`. All three paths (exists+true, exists+false, !openspecDir) set the field correctly.
- **`ImportProgress.tsx` simplification**: Replaced ~160 lines of EventSource consumer with ~55 lines that subscribe to the Zustand store. The completion predicate (`state.exists && state.generatedMarkerPresent`) mirrors what the `state-replaced` WS event triggers via `store.load()`. No SSE, no polling.
- **`ImportConfirmModal.tsx`**: `onConfirm` signature changed from `(jobId: string) => void` to `() => void` — the `jobId` was only used to construct the SSE URL, which is gone.
- **`ImportProjectFlow.tsx`**: `progress` phase drops `jobId`, `done` phase is unchanged. The phase now flows: `confirm → progress` on accept (server returns 202), then `progress → done` when the store fires the completion predicate.
- **New skill pair**: `.claude/commands/ithy-opsx/import.md` and `.claude/skills/ithy-opsx-import/SKILL.md` follow the dispatch/archive command pattern. The boot prompt template in the SKILL includes all required items from task 1.3.
- **Tests**: `server/import-spec-gen.test.ts` replaced SSE / subprocess tests with `preflight` + `injectImportCommand` unit tests. `web/src/components/ImportProgress.test.ts` replaced EventSource mock tests with store-state predicate tests.
- **Type propagation**: `NoProjectDecisionPanel.test.ts` had two hardcoded `WorkspaceState` literals that needed `generatedMarkerPresent: false` — caught and fixed by typecheck.
- All automated gates pass: `openspec validate --strict`, `npm test` (pre-existing `build-icons/sharp` failure only), `npm run typecheck`, `npm run build`.

## Surprises

- **`ImportConfirmModal.tsx` `PreflightData` type still includes `jobId`**: The confirm modal still shows preflight stats (code file count, est. context bytes) via a dry-run POST. The `jobId` in `PreflightData` is still returned by the server in the 202 dry response but is now unused by the client. Kept it in the type to avoid a mismatch but the client no longer reads it. Clean-up could happen in a follow-up.
- **`LANG_SOURCE_DIRS` and `detectLanguage` removed**: These were only used by `buildBootPrompt` in the old subprocess path. The new design puts language-detection guidance into the skill's boot prompt template (the sub-agent discovers the language from manifest files itself), so the server no longer needs a language detection pass. The boot prompt's discovery table covers the same languages.
- **`ImportProjectFlow` `done` phase calls `onComplete` with no state**: The parent `onComplete: (projectRoot: string) => void` contract is unchanged — it receives `phase.projectRoot` string, not `WorkspaceState`. The `WorkspaceState` is received by the inner `handleComplete` handler but only used to gate the transition; it is not forwarded to the parent because the parent doesn't need the full state.

## Differently

- **Boot prompt format code block escaping**: The SKILL.md boot prompt template uses nested code fences (the boot prompt contains code blocks intended for the sub-agent). Used indented code sections (4-space) inside the outer fenced block to avoid triple-backtick collision. If this proves confusing in practice, the skill could externalise the boot prompt to a separate file or use a heredoc pattern.
- **503 message**: The spec says `{ error: "Manager PTY not running; add agents.yaml..." }`. Appended the `injectIntoActive` failure reason in parentheses for diagnostics: `(No embedded terminal is open. Open a change view to start one.)`. More actionable than the spec's text alone.
- **`injectImportCommand` as a testable pure function**: Rather than calling `injectIntoActive` directly in `server/index.ts`, the function accepts the injector as a parameter. This makes the unit test straightforward (mock the injector, assert the command string) without mocking module-level state.

## Follow-ups

- **`ImportConfirmModal.tsx` `PreflightData.jobId` cleanup**: The `jobId` field in the dry-run response is now dead code on the client. A minor cleanup PR could remove it from `PreflightData` and strip the field from the server response shape.
- **`estimatedContextBytes` / `scanCounts` / `filesToScan` in the confirm modal**: These fields still show the "how many files will the sub-agent read" stats from the preflight scan. That's useful to keep — it gives the user a sense of project size before confirming. No change needed; just noting that these fields are retained intentionally.
- **Watcher scope for imported projects**: The current `state-replaced` mechanism works because ithyno watches its own `openspec/` dir. If the target project's `openspec/GENERATED.md` lands in a DIFFERENT directory (not the ithyno project), the watcher won't see it. This is by design — ithyno is pointed at one project at a time. If multi-project support becomes a goal, the watcher would need to track the import target.
- **Task 8.5–8.9 (manual verification)** deferred to the operator.

---

## Rework round 2

Fixed all 7 findings from the round-1 review (5 named fixes + 2 info items).

### F1 (critical) — completion-signal loop broken when openspec/ absent

Added `ProjectRootWatcher` class in `server/sync/watcher.ts`. It watches the
project root at depth 0 for an `addDir` event whose path matches
`<projectRoot>/openspec`. On first detection it stops itself and calls
`onOpenspecCreated()`. In `server/index.ts`, the watcher startup was extracted
into a `startOpenspecWatcher(resolvedDir)` helper so the same logic is reused
at boot (when openspec/ already exists) and at runtime (when the import sub-
agent creates it). When `openspecDir === null` at boot, `ProjectRootWatcher` is
started on `PROJECT_ROOT`; its callback re-resolves `openspecDir`, calls
`startOpenspecWatcher`, and broadcasts `state-replaced`. This fixes the hang
where `ImportProgress.tsx` would never receive the completion signal.

### F2 (major) — missing 400 size cap test

Added `"rejects 400 when total file size exceeds 50 MB cap"` test in
`server/import-spec-gen.test.ts`. Uses `fs.truncate` to create a sparse `.ts`
file whose apparent size is 51 MB without writing 51 MB of data to disk. The
test confirms `result.ok === false`, `result.status === 400`, and the reason
message contains "exceeds" and "50 MB".

### F3 (minor) — `onComplete` no once-guard

Added `const firedRef = useRef(false)` guard in `ImportProgress.tsx`. The
`useEffect` now checks and sets `firedRef.current` before calling
`onCompleteRef.current(state)`, preventing double-invocation in React Strict
Mode or from rapid duplicate `state-replaced` events.

### F4 (minor) — `targetPath` shell/prompt injection

`injectImportCommand` in `server/import-spec-gen.ts` now validates `targetPath`
against `/[\x00-\x1f\x7f-\x9f]/` before building the PTY command. Control
characters (CR, LF, NUL, all C0/C1 range) are rejected with
`{ ok: false, reason: "...", status: 400 }`. The `server/index.ts` handler maps
`status === 400` to a 400 HTTP response. Four new unit tests cover `\n`, `\r`,
`\x00`, and the guard that blocks the injector from being called at all.

### F5 (minor) — `injectIntoActive` targets wrong PTY

Added `injectIntoManager(managerCwd, data, terminate)` in `server/sync/pty.ts`.
The `LiveTerminal` type now includes `cwd: string` (set from `opts.cwd` in
`attachPtyToSocket`). `injectIntoManager` walks `live[]` from tail to head and
returns the first entry whose `cwd` matches `managerCwd` (the ithyno project
root). Returns 503-mapped `{ ok: false }` when no matching PTY exists. The
Import endpoint in `server/index.ts` now calls `injectIntoManager(PROJECT_ROOT,
...)` instead of `injectIntoActive`, ensuring the command always lands in the
Manager terminal regardless of which terminal was last active.

### F6 / F7 (info)

F6 (backtick in TARGET_PATH in skill template) — noted as hypothetical; no
change made. F7 (task 7.1 references wrong test filename) — cosmetic artifact
mismatch; no change made since the actual file name `import-spec-gen.test.ts`
is correct and the task is complete.

### Sanity check

- `npm run openspec -- validate refactor-import-to-task-tool-subagent --strict` → valid
- `npm test` → 414 passed, 1 skipped, 1 pre-existing failure (build-icons/sharp not installed)
- `npm run typecheck` → clean
- `npm run build` → clean

---

## Rework round 3

Fixed the critical F1 finding and addressed NF1 (idempotency) and NF2 (diagnostic logging). 4 additional tests added (18 total for this change).

### F1 (critical) — /api/state returns exists: false after runtime openspec/ creation

**Root cause**: `const openspecDir = resolveOpenspecDir(PROJECT_ROOT)` on line 59 of `server/index.ts` was resolved once at boot and never updated. In the import scenario (ithyno starts with no `openspec/`), this was always `null`. The `/api/state` handler called `scanWorkspace(openspecDir, PROJECT_ROOT)` with the stale null, so `scanWorkspace` always returned `{ exists: false }`. Even after the import sub-agent created `openspec/` and wrote `GENERATED.md`, the response was `{ exists: false, generatedMarkerPresent: true }`. The client predicate `state.exists && state.generatedMarkerPresent` was `false && true` — never fired.

**Fix applied (server-side, architecturally correct)**:

1. Changed `const openspecDir` to `let openspecDir` so it can be updated at runtime.
2. `/api/state` handler now calls `resolveOpenspecDir(PROJECT_ROOT)` on every request (live re-resolution). It also updates the module-level `openspecDir` if it discovers a non-null path when the current value is null — so other handlers (withinOpenspec, change endpoints) immediately benefit too.
3. `ProjectRootWatcher` callback explicitly updates `openspecDir = newOpenspecDir` before calling `startOpenspecWatcher`. This ensures the module-level variable is updated even if `/api/state` hasn't been called yet.

The client predicate in `ImportProgress.tsx` is unchanged (`state.exists && state.generatedMarkerPresent`) — both predicates are correct now that the server returns honest state.

### NF1 (minor) — idempotency guard for ProjectRootWatcher double-start

Added an `openspecWatcherStarted` boolean flag in the `else` block of `server/index.ts`. The `ProjectRootWatcher` callback checks and sets this flag before calling `startOpenspecWatcher`. A duplicate call (hypothetical: future refactor adds a second code path) is logged and ignored rather than silently overwriting the watcher reference and orphaning the chokidar instance.

### NF2 (info) — injectIntoManager diagnostic logging

When `injectIntoManager` finds no terminal matching `managerCwd`, it now logs a `console.warn` that includes both the expected cwd and the list of actual cwds of all live terminals. Example:
```
[pty] injectIntoManager: no terminal found for cwd "/Users/foo/my-project". Live terminal cwds: "/Users/foo/my-project/.worktrees/some-change" 
```
This makes it immediately clear whether the Manager PTY was never opened (cwds: none) or was opened with a different cwd (cwd mismatch diagnostic).

### N3 (info) — withinOpenspec uses frozen openspecDir

This was flagged as a pre-existing limitation. Now that `openspecDir` is mutable and gets updated by both the ProjectRootWatcher callback and the `/api/state` handler, `withinOpenspec` will also benefit once the module-level variable is updated. The update happens synchronously in the callback before any subsequent request, so after the first `/api/state` call post-import, `withinOpenspec` will accept paths under the new `openspec/`. This is a meaningful improvement over the old behavior (which required a server restart).

### E2E unit tests added

Added `resolveOpenspecDir + scanWorkspace — import runtime scenario (F1 regression)` suite in `server/parser/workspace.test.ts` with 4 tests:
- Confirms `resolveOpenspecDir` returns null before `openspec/` exists
- Confirms `resolveOpenspecDir` returns the path after `openspec/changes/` is created
- Confirms `scanWorkspace(liveOpenspecDir, root)` returns `{ exists: true, generatedMarkerPresent: true }` after `GENERATED.md` is written — the passing case that was broken before this fix
- Documents the old broken behavior (`stale null → exists: false`) for regression contrast

### Sanity check

- `npm run openspec -- validate refactor-import-to-task-tool-subagent --strict` → valid
- `npm test` → 418 passed (4 new tests), 1 skipped, 1 pre-existing failure (build-icons/sharp not installed)
- `npm run typecheck` → clean
- `npm run build` → clean
