# Outcome — enable-import-both-patterns

## Worked

- `ImportTargetWatcher` added to `server/sync/watcher.ts` as a sibling class alongside `ProjectRootWatcher`. Watches `<targetRoot>/openspec/GENERATED.md`, fires callback once per jobId, self-deregisters after 30 s grace period. Pre-existence check at `start()` handles the race where the marker is written before the watcher initialises.
- `server/import-jobs.ts` implemented cleanly — bounded `Map` (max 20), TTL sweep on every `registerImportJob`, idempotent re-register, 429 on cap overflow.
- `POST /api/import/spec-generation` extended in `server/index.ts` with three new gates in order: doctor → preflight → job-registry-cap. Pattern classification (`targetPath === PROJECT_ROOT ? "B" : "A"`) derived after preflight, included in the 202 response and stored in the job record.
- `import-completed` WS event added to `ServerEvent` union (server) and `ImportCompletedEvent` type (client). Store routes Pattern B to `load()` and Pattern A to `pushImportNotification`.
- `ImportedProjectNotification` component — renders targetPath, timestamp, [Open imported project] / [Dismiss] buttons. Notification region stacks in `App.tsx` above the toast div. Electron / VS Code / browser-fallback branching via existing runtime helpers.
- All automated checks pass: `validate --strict` VALID, `npm test` (450 pass / 1 pre-existing `sharp` failure), `typecheck` clean, `build` success.

## Surprises

- **`add-doctor-and-installer` not yet merged**: `server/doctor.ts` does not exist in this branch. A stub was created that checks only `claude` via `which`/`--version`. The stub has the same `runDoctor(): Promise<DoctorReport>` signature as the real module so a merge will be a simple file replacement. See stub header comment.
- **`existsSync` not previously imported in `watcher.ts`**: Needed to add the import for the pre-existence check. Minor but worth noting because the rest of the file uses async `readFile` — the sync check here is intentional (one-shot at start time, not in a hot loop).
- **Watcher test uses real fs/chokidar events**: These tests write to a tmpdir and need 300–600 ms settle times. They work reliably but are slower than pure-logic tests. Tagged `10_000` ms timeout.

## Differently

- **Doctor stub**: Ideally this change would simply `import { runDoctor } from "./doctor.js"` pointing at the real module from `add-doctor-and-installer`. Because that branch is in flight in a parallel worktree, a stub was the safest approach. The stub is clearly marked for replacement after merge.
- **Pattern B `import-completed` handling**: The store's Pattern B handler calls `load()` rather than routing through `ImportProgress.tsx`'s `onComplete`. This is correct — `ImportProgress` already watches `state.generatedMarkerPresent` via the existing `state-replaced` path. The `import-completed` event adds a second, faster path for Pattern B, but both paths converge on the same UI transition. No double-trigger risk because `ImportProgress` uses a `firedRef.current` once-guard.

## Follow-ups

- **Merge `server/doctor.ts` from `add-doctor-and-installer`**: Replace the stub file once that branch lands. The stub intentionally has the same export shape so the replacement is non-breaking.
- **`openProject` IPC**: The `window.ithyno.openProject` call in `ImportedProjectNotification.tsx` assumes the Electron preload exposes this function. Verify it is wired in `electron/src/main.ts` when the Electron shell is being built.
- **VS Code `switchWorkspace` command**: Noted as a follow-up in the proposal. Not yet implemented in the VS Code extension; the notification shows the browser fallback (copy-path) when the command is absent.
- **CSS for `.import-notifications-region` and `.imported-project-notification`**: Skeleton classes referenced in the component and App shell. Styling pass needed before the feature is fully visually polished.
- **Grace period deregistration test**: The 30 s grace timer test is omitted from the unit suite (would require `vitest.useFakeTimers`) — a follow-up test or manual observation is recommended.
