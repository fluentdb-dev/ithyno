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
