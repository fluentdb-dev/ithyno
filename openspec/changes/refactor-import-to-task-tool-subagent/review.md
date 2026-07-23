---
verdict: needs-rework
reviewer: manager-fallback
model: sonnet
change_id: refactor-import-to-task-tool-subagent
---

# Review

## Findings

### Finding 1 (severity: critical)
**File**: `server/index.ts:132` / `server/sync/watcher.ts:27`
**Issue**: The completion-signal path is broken for the exact use-case this change targets. The server computes `openspecDir = resolveOpenspecDir(PROJECT_ROOT)` once at boot. When ithyno starts with no existing `openspec/` directory (the import scenario — `state.exists === false`), `openspecDir` is `null` and the `if (openspecDir) { watcher = new Watcher(...) }` guard means no file watcher is ever started. Consequently, no `state-replaced` WS broadcast fires when the sub-agent later creates `openspec/` and `openspec/GENERATED.md`. `ImportProgress.tsx`'s `useEffect` subscribes to store state that never updates, so `onComplete` never fires and the dashboard is stuck in the progress phase indefinitely.

The fix must emit a `state-replaced` broadcast when `openspec/GENERATED.md` is created even when no prior watcher exists. Options include: (a) start a fallback `fs.watch`/chokidar watcher on `PROJECT_ROOT` itself (not `openspecDir`) whenever `openspecDir === null`, broadcasting `state-replaced` on any `openspec/` appearance; (b) have the server poll lightly after a POST to `/api/import/spec-generation` until the marker appears; or (c) require that ithyno's project root already has `openspec/` before the import command is accepted (changes the UX contract).

### Finding 2 (severity: major)
**File**: `server/import-spec-gen.test.ts` (missing test case)
**Issue**: Task 7.1 explicitly requires "400 on oversized" test coverage. The existing test suite does not include any test for the size-cap rejection path (50 MB). While the preflight logic itself is carried over intact from the archived predecessor, the test coverage claim in `tasks.md` is not met. A reviewer cannot confirm the 400 path is exercised.
**Fix**: Add a test that creates a temp file large enough to exceed `SIZE_CAP_BYTES` (or mock `lstat` to return a large size), calls `preflight`, and asserts `result.ok === false && result.status === 400`.

### Finding 3 (severity: minor)
**File**: `web/src/components/ImportProgress.tsx:39-44`
**Issue**: `onComplete` is not guarded against duplicate firings. The `useEffect` runs every time `state` changes. If the WS delivers two consecutive `state-replaced` events both arriving with `generatedMarkerPresent === true` before React unmounts `ImportProgress`, `onComplete` fires twice. The parent sets `phase` to `"done"` which enqueues an unmount, but in the same React flush the second state update may trigger the effect again before the unmount lands. In React Strict Mode (dev) effects intentionally run twice per mount, which would fire `onComplete` twice unconditionally.
**Fix**: Add a `firedRef = useRef(false)` guard: `if (firedRef.current) return; firedRef.current = true; onCompleteRef.current(state);`

### Finding 4 (severity: minor)
**File**: `server/import-spec-gen.ts:179`
**Issue**: `targetPath` is injected verbatim into the PTY slash-command string — `"/ithy-opsx:import " + targetPath` — with no check for embedded control characters (principally `\r`, `\n`, `\x03`). On Linux/macOS, file paths technically may contain newline characters (unusual but valid). A path containing `\n` would cause two separate lines to be written to the PTY, the second of which would be an arbitrary command injection into the Manager's session. `resolve()` normalizes separators but does not strip embedded newlines.
**Fix**: Before injecting, validate that `targetPath` contains no characters outside the printable ASCII/Unicode range expected for file paths, or at minimum reject paths containing CR/LF/NUL (`/[\r\n\0]/`). The `isAuthorizedImportPath` blocklist does not cover this.

### Finding 5 (severity: minor)
**File**: `server/sync/pty.ts:257-258`
**Issue**: `injectIntoActive` targets `live[live.length - 1]` — the most recently bumped PTY entry — not specifically the Manager PTY. If the user activates a second PTY (e.g. a worktree terminal) between opening the Manager and clicking Import, `bump()` moves that second entry to the tail and the `/ithy-opsx:import` command lands in the wrong terminal. This is pre-existing behavior shared with `/api/pty/inject`, not introduced by this change, but the change now relies on it for a non-interactive server-triggered dispatch where the user cannot see which terminal received the command.
**Fix**: Either document this as a known limitation (manager-must-be-last-active) or add a Manager-specific selector (e.g. tag terminals with their role at spawn time and resolve by role here).

### Finding 6 (severity: info)
**File**: `.claude/skills/ithy-opsx-import/SKILL.md:151` (boot prompt `<TARGET_PATH>` substitution)
**Issue**: The boot prompt template embeds `<TARGET_PATH>` as plain text in a Markdown fenced block. If the target path contains backtick sequences (e.g., `` `/some/path` ``), the Markdown rendering could break the code block structure. In practice, OS paths don't contain backticks, so this is hypothetical. No change required unless hardening is desired.

### Finding 7 (severity: info)
**File**: `openspec/changes/refactor-import-to-task-tool-subagent/tasks.md` task 7.1
**Issue**: Task 7.1 references `server/import.test.ts` (a rename that was never performed) but the actual file is `server/import-spec-gen.test.ts`. This is a cosmetic mismatch in the task artifact and does not affect runtime behavior.

## Verdict

needs-rework — Finding 1 is a critical functional bug: the completion signal (`state-replaced` → `generatedMarkerPresent` → `onComplete`) will never fire for the canonical use-case (ithyno started against a project with no existing `openspec/` directory), leaving the dashboard stuck in the progress phase indefinitely. Finding 2 is a major gap in test coverage explicitly promised by `tasks.md`. Findings 3–5 are minor correctness issues that should be fixed before ship.
