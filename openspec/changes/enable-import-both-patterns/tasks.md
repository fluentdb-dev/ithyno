# Tasks

## 1. ProjectRootWatcher extension

- [ ] 1.1 In `server/sync/watcher.ts`, extend `ProjectRootWatcher` (or add a sibling `ImportTargetWatcher`) to accept a list of extra roots to watch. When a target root's `openspec/GENERATED.md` appears, invoke a callback with `{ targetPath, jobId }`.
- [ ] 1.2 The extra watcher is registered on Import dispatch and unregistered on completion + 30s grace or on job cancellation.
- [ ] 1.3 Idempotency: registering the same targetPath+jobId twice is a no-op. Duplicate marker-file events fire callback only once per jobId.

## 2. Import job tracking

- [ ] 2.1 Add `server/import-jobs.ts` — bounded Map (max 20 concurrent) with per-job records: `{ jobId, targetPath, startedAt, pattern }`. TTL 1 hour; sweep on register.
- [ ] 2.2 Expose `registerImportJob(job)` / `getImportJob(jobId)` / `deleteImportJob(jobId)`.
- [ ] 2.3 When Import dispatches, register the job with `pattern` computed from `targetPath === PROJECT_ROOT`.

## 3. Import endpoint enhancements

- [ ] 3.1 In `POST /api/import/spec-generation`, add doctor preflight: `runDoctor()` → if `readyForManager === false` return 409 with the same message convention as `expand-init-to-scaffold-agents`.
- [ ] 3.2 Response gains `pattern: "A" | "B"` in the 202 shape.
- [ ] 3.3 Register the import job before injecting the Manager command.
- [ ] 3.4 When the ProjectRootWatcher fires with the completion marker, broadcast an `import-completed` WS event `{ jobId, targetPath, pattern }` and delete the job.

## 4. WS event dispatch

- [ ] 4.1 Add `import-completed` to the WS event union type in server + client type files.
- [ ] 4.2 Server: broadcast on marker detection.
- [ ] 4.3 Client (`web/src/store.ts` WS message handler): on `import-completed`, delegate to the ImportProgress or push a notification per pattern.

## 5. Dashboard UX — Pattern A notification

- [ ] 5.1 New `<ImportedProjectNotification />` component. Renders as a persistent card in a top-right notification region (new region in the App shell or reuse existing toast area). Text: "Import complete for `<targetPath>`. Sub-agent finished at `<timestamp>`."
- [ ] 5.2 Actions: [Open imported project] → invokes the Electron/VS Code project-switch handler with `targetPath`; [Dismiss] → removes the card.
- [ ] 5.3 Multiple concurrent A-imports stack in the region; each dismisses independently.

## 6. Dashboard UX — Pattern B transition

- [ ] 6.1 On `import-completed` when `pattern === "B"`: existing flow — refetch state, ImportProgress fires `onComplete`, dashboard transitions to Kanban with the banner.

## 7. Project-switch handler wiring

- [ ] 7.1 Electron: existing `switchProject` handler (`electron/src/main.ts`) — reused. The client calls `window.ithyno.openProject(targetPath)` if available.
- [ ] 7.2 Browser: not applicable (no cross-project switching in browser mode). Notification shows a copy path button instead: user launches ithyno with `--dir <targetPath>` manually.
- [ ] 7.3 VS Code: `ithyno.switchWorkspace` command already exists (or is a follow-up) — invoke it with targetPath.

## 8. Concurrency + limits

- [ ] 8.1 Max 20 concurrent Import jobs (Pattern A). Return 429 on excess with clear message.
- [ ] 8.2 Job TTL 1 hour — abandoned jobs cleaned up automatically.

## 9. Tests

- [ ] 9.1 `server/sync/watcher.test.ts` — extended watcher fires on target GENERATED.md; deregisters after 30s.
- [ ] 9.2 `server/import-jobs.test.ts` — register/get/delete + TTL sweep + 20-concurrent cap.
- [ ] 9.3 `server/import-spec-gen.test.ts` — 409 on doctor.readyForManager false; response includes pattern.
- [ ] 9.4 `web/src/components/ImportedProjectNotification.test.ts` — renders, dismisses, invokes open handler.
- [ ] 9.5 `web/src/store.test.ts` — `import-completed` WS message routes to notification for A, ImportProgress for B.

## 10. Verification

- [ ] 10.1 `npm run openspec -- validate enable-import-both-patterns --strict` passes.
- [ ] 10.2 `npm test` passes.
- [ ] 10.3 `npm run typecheck` passes.
- [ ] 10.4 `npm run build` passes.
- [ ] 10.5 Manual (Pattern A): ithyno running on openspec-ui repo → menu → Import → pick fluentdb → Confirm → progress → completion notification → click Open → fluentdb loads as new ithyno project with openspec/ visible.
- [ ] 10.6 Manual (Pattern B): fresh dir → Init (with Manager scaffolding) → Import (same dir) → sub-agent runs → dashboard transitions to Kanban with LLM-drafts banner.
- [ ] 10.7 Manual: no agent CLI installed → hit Import → 409 with doctor link.
- [ ] 10.8 Write `openspec/changes/enable-import-both-patterns/outcome.md`.
