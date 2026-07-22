# Outcome: import-project-spec-generation

## Worked

- **Endpoint scaffolding**: `POST /api/import/spec-generation` implemented in `server/import-spec-gen.ts` (new module), registered in `server/index.ts`. Preflight checks (409 for existing openspec/, 400 for size cap, 403 for unauthorized paths) work correctly.
- **Dry-run mode**: Added `dry: true` support that returns preflight data without starting a job. Used by `ImportConfirmModal` on first open.
- **SSE streaming**: `GET /api/import/spec-generation/:jobId/events` streams `event: progress`, `event: done`, and `event: error` lines using a simple in-memory listener registry.
- **Generation subagent**: Spawns `claude -p "<boot-prompt>"` as a subprocess. Boot prompt is constructed with the target root, detected language (Flutter/Node/Rust/Python/generic), and step-by-step instructions for reading code+docs, running `openspec init`, writing capability specs, writing `GENERATED.md`, and NOT committing.
- **Dashboard UI**: `ImportConfirmModal`, `ImportProgress`, and `ImportProjectFlow` components implement the full flow. `ImportProjectFlow` is accessible from the empty-state ("No OpenSpec project found") via a new "Import: generate OpenSpec specs from existing code" button.
- **Post-import banner**: "Specs are LLM-generated drafts — review before relying on them" banner shows on import completion, dismissible.
- **Electron integration**: File → Import Existing Project… menu item (Cmd+Shift+I) opens native OS folder picker, sends `ithyno:import-project` IPC to the renderer via preload, App.tsx subscribes and opens ImportProjectFlow.
- **VS Code integration**: `ithyno.importProject` command registered in `package.json` and `extension.ts`. Opens folder picker, posts `{ type: "ithyno:import-project", projectRoot }` message to the webview. App.tsx listens via `window.addEventListener("message", ...)`.
- **Tests**: Server preflight tests in `server/import-spec-gen.test.ts` (8 tests), UI logic tests in `ImportConfirmModal.test.ts` and `ImportProgress.test.ts`.
- All automated checks pass: `npm test` (new tests pass; pre-existing `build-icons.test.mjs` failure unrelated), `npm run typecheck`, `npm run build`.

## Surprises

- **ReadOnlyBrowse dependency**: The original task called for placing the Import button in `ReadOnlyBrowse.tsx` from `unify-open-project-3-branch`, but that change was still in-flight (same worktree branch point). Chose option (b): surfaced the import button in the empty-state instead. This is a valid standalone entry point and the `ImportProjectFlow` component is ready to be embedded in `ReadOnlyBrowse` when that change lands.
- **Server-side claude subprocess**: The Claude Code Task tool is not available in the Fastify server context, so we fall back to spawning `claude -p "<prompt>"` as a subprocess. This requires `claude` to be on PATH in the server process's environment — fine for local dev (where the user has `claude` installed), but worth documenting for packaged Electron builds.
- **EventSource auth**: EventSource API doesn't support custom headers. The token is threaded via a query param in `ImportProgress.tsx` — same pattern used by the PTY WebSocket.
- **Job registry is in-memory**: Jobs are stored in the module-level `Map`. On server restart, in-flight jobs are lost. For this feature (single import job, takes minutes at most) this is acceptable.

## Differently

- If doing this again, would implement a proper job queue with persistence (SQLite or a simple JSON file) so jobs survive server restarts and can be listed/cancelled from a management UI.
- The boot prompt injection of language detection could be split into a dedicated language-detect endpoint so the UI can show the user what language was detected before they confirm.
- The VS Code postMessage relay could be made bidirectional (progress events → extension progress notifications) for a richer VS Code experience.
- Could make the size cap configurable via `agents.yaml` or a settings endpoint instead of a hardcoded constant.

## Follow-ups

- **"Review + commit" affordance**: After import completes, add a one-click "Review & Commit" button that batches the `openspec/` files into a git commit in the target repo, saving the user from having to cd there and run git commands.
- **Re-generation flow**: "Refresh specs" button that re-runs the import subagent on an already-initialized project (useful after major code changes). Would need a `force: true` pass and a check for user confirmation.
- **Language-specific prompts**: The current boot prompt is generic. Flutter (Dart/pubspec.yaml), Python (pyproject.toml/module structure), and Rust (Cargo.toml/workspace) could each benefit from language-specific sampling strategies and capability naming conventions.
- **Cost estimator**: Show a $ estimate based on the estimated token count before the user confirms. Would need a pricing table (model, input/output token costs) — potentially from a config or the Anthropic API.
- **ReadOnlyBrowse integration**: Once `unify-open-project-3-branch` lands, add the Import button to `ReadOnlyBrowse.tsx` using the same `ImportProjectFlow` component (it accepts an optional `projectRoot` prop that `ReadOnlyBrowse` would fill in).
- **Cancel running job**: Currently the Cancel button in `ImportProgress` just navigates away — the subagent subprocess keeps running. A proper cancel should send SIGTERM to the spawned process.
