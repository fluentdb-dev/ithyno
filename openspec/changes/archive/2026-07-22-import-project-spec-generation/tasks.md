# Tasks

## 1. Endpoint scaffolding

- [x] 1.1 `POST /api/import/spec-generation` in `server/index.ts` (or a new `server/import.ts` router). Accepts `{ projectRoot: string, force?: boolean }` in the body. Returns `{ jobId: string, estimatedContextBytes: number, scanCounts: { code: N, docs: M }, filesToScan: string[] }` synchronously on the preflight response.
- [x] 1.2 Preflight checks (before returning jobId): reject with 409 if `<projectRoot>/openspec/` exists AND `force !== true`; reject with 400 if the estimated size exceeds a configurable cap (default 50 MB of code+docs); reject with 403 if the path isn't under an authorized directory (basic safety).
- [x] 1.3 The endpoint kicks off the generation job asynchronously and returns immediately with the jobId. The job's progress is streamed on a new `GET /api/import/spec-generation/:jobId/events` (SSE).

## 2. Generation job

- [x] 2.1 The generation job runs as a subagent (Task tool with `subagent_type: "claude"` and `model: "sonnet"` — the pattern used by `/ithy-opsx:dispatch-multi` for code stages). The subagent is dispatched with a boot prompt:
  - Read the specified project root's `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/**/*.md`
  - Walk the primary source tree per language (Flutter → `lib/`; Node → `src/` or `server/` + `web/`; Rust → `src/`; Python → `src/` or package name; fallback → top-level directories)
  - Read a bounded sample of source files (default: first 100 files, largest first, capped at 5000 lines total)
  - Read `package.json` / `pubspec.yaml` / `Cargo.toml` / `pyproject.toml` for stated purpose + declared dependencies
- [x] 2.2 The subagent runs `openspec init` on the target root first (creates the empty scaffolding).
- [x] 2.3 The subagent identifies capabilities by feature-area analysis of the code + docs, then writes `openspec/specs/<capability>/spec.md` for each. Every requirement follows OpenSpec's SHALL + Scenario shape. Every emitted spec.md validates via `openspec validate --all --strict`.
- [x] 2.4 The subagent writes `openspec/GENERATED.md` at project root with a header noting the specs are LLM-generated drafts, the timestamp, and links to each generated capability.
- [x] 2.5 The subagent MUST NOT commit — leaves the project's git tree with untracked/added openspec/ files.

## 3. Progress streaming

- [x] 3.1 The subagent emits progress messages to the parent job (via stdout parsing or a shared file — pick the mechanism that fits the Task-tool contract). Messages of the form `[import] read: <path>` or `[import] drafted: <capability>`.
- [x] 3.2 `GET /api/import/spec-generation/:jobId/events` streams these lines as SSE `event: progress\ndata: <line>\n\n` to any connected client.
- [x] 3.3 On completion (subagent returns), the stream emits `event: done\ndata: { capabilities: [...], durationMs: N }` and closes.

## 4. Dashboard UI

- [x] 4.1 In `ReadOnlyBrowse.tsx` (from `unify-open-project-3-branch`), add a prominent "Import: generate openspec specs from this code" button in the header (secondary color). *(Implemented in the empty-state instead — see outcome.md for rationale.)*
- [x] 4.2 Clicking the button opens a `<ImportConfirmModal />` (new component) which:
  - Fetches preflight via `POST /api/import/spec-generation` with `force: false, dry: true` (extend the endpoint to support a dry-run mode)
  - Shows the estimated context size, list of directories/files that will be scanned, the LLM cost implication ("Est. ~N tokens sent"), and a big Confirm button
  - Confirm re-sends the request with `dry: false`; on 2xx returns the jobId
- [x] 4.3 `<ImportProgress jobId={id} />` (new component) opens an EventSource to the SSE stream, renders a live-updating list of progress lines, and shows a spinner while the job is running.
- [x] 4.4 On `event: done`, the progress component transitions the app to the newly-initialized project (refetches `/api/state`, drops browseMode, mounts Kanban) and renders a top-of-page dismissible banner: "Specs are LLM-generated drafts — review before relying on them."
- [x] 4.5 If the SSE stream errors or emits `event: error`, show the error message + a Retry / Cancel pair.

## 5. Electron menu integration

- [x] 5.1 In `electron/src/menu.ts`, add "File → Import Existing Project…" menu item. It picks a folder via native dialog (like Open Project), then:
  - Loads the folder in the dashboard
  - If it has no `openspec/`, the decision panel from `unify-open-project-3-branch` renders — with the Browse button pre-highlighted
  - Effectively an alias for Open Project + click Browse; documented as the "official" import entry point

## 6. VS Code extension parity

- [x] 6.1 Register a new command `ithyno.importProject` in `vscode-extension/package.json`. Same behavior as the Electron menu item.

## 7. Tests

- [x] 7.1 `server/import-spec-gen.test.ts`: endpoint preflight rejection (existing openspec/ without force, size cap, invalid path). Mock the subagent invocation (don't actually run it — assert the correct Task-tool call was made).
- [x] 7.2 `web/src/components/ImportConfirmModal.test.ts` and `ImportProgress.test.ts`: render + interact with a mocked SSE stream.
- [ ] 7.3 **Manual end-to-end**: run against the fluentdb boilerplate repo. Assert the produced openspec/specs/ validates cleanly + contains at least 3 capabilities.

## 8. Verification

- [x] 8.1 `npm run openspec -- validate import-project-spec-generation --strict` passes.
- [x] 8.2 `npm test` passes (including new server + client tests).
- [x] 8.3 `npm run typecheck` passes.
- [x] 8.4 `npm run build` passes.
- [ ] 8.5 Manual: point ithyno at the fluentdb boilerplate (via Import menu OR Browse mode's Import button). Confirmation modal shows sensible preflight (est. size, ~N files). Confirm → progress streams live → completion → Kanban loads with the fresh project + banner visible.
- [ ] 8.6 Manual: inspect the generated `openspec/specs/`. Confirm at least 3 capabilities, all validate via `openspec validate --all --strict`.
- [ ] 8.7 Manual: `git status` in the fluentdb repo shows the openspec/ + openspec/GENERATED.md as untracked/added, no automatic commit was made.
- [ ] 8.8 Manual: attempt import on a repo that already has openspec/ → 409, dashboard shows a clear error. Retry with force=true (via a hidden flag or explicit UI toggle) succeeds.
- [ ] 8.9 Manual: attempt import on a synthetic > 50 MB repo → preflight rejects with size-cap message.
- [x] 8.10 Write `openspec/changes/import-project-spec-generation/outcome.md` (✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups). Follow-ups: consider a "review + commit" affordance that batches the openspec/ files into a git commit for the user; consider a re-generation flow to update specs after code changes; consider language-specific generation prompts (Flutter, Python, Rust, etc.); consider a cost estimator that shows actual $ cost for the LLM run.
