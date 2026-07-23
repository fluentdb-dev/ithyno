# Outcome: expand-init-to-scaffold-agents

## Worked

- **Doctor gate + resolveManagerFromDoctor extracted** into `server/init-handler.ts`, making the
  business logic unit-testable without spinning up the full Fastify server. All 4 required test
  paths (409 no-CLI, 400 bad-CLI, 200 default-fallback, agents.yaml write) pass.

- **`templates/agents.yaml.tmpl`** created with `{{MANAGER_COMMAND}}` placeholder. The
  `POST /api/init` handler reads it, substitutes, writes `agents.yaml`, and rolls back `openspec/`
  on write failure.

- **`server/doctor.ts` stub** created with the same interface as `add-doctor-and-installer`'s
  design (`Cli`, `CliStatus`, `DoctorReport`, `runDoctor()`, `CLI_PRIORITY`). The stub checks each
  CLI binary in PATH via `--version`. It will be replaced when `add-doctor-and-installer` lands.

- **`InitDialog` component** created at `web/src/components/InitDialog.tsx`. Fetches `/api/doctor`
  on mount, renders per-CLI status, blocks Init if `readyForManager === false`, shows the Manager
  picker limited to installed CLIs, defaults to the stored `defaultManager` or priority order.

- **`NoProjectDecisionPanel`** refactored: "Initialize" button now opens `<InitDialog />` instead of
  directly POSTing. On success the dialog closes and `load()` refetches state.

- **`OnboardingProject`** extended: added a `dialog` phase before the SSE chain. When the dialog
  completes, the chosen CLI is stored, the step progress view shows a new `prereq` and
  `agents-yaml` step. After the SSE chain, a follow-up `POST /api/init` writes `agents.yaml`.

- **`defaultManager` store slice** added: `Cli | null`, persisted to
  `localStorage["ithyno.defaultManager"]`, `setDefaultManager` action, hydrated at module load.

- **Settings `DefaultManagerSection`** added: fetches `/api/doctor`, shows radio group for
  installed CLIs only. Placed between Agmsg and New Project sections.

- All checks pass: `openspec validate --strict`, `npm test` (446 pass, 1 pre-existing failure
  unrelated to this change — `sharp` package missing in CI), `typecheck`, `build`.

## Surprises

- **`add-doctor-and-installer` not yet in branch**: As noted in the task brief, `server/doctor.ts`
  was not yet present. Created a stub that shells out to `<cli> --version` for each CLI. The stub
  interface exactly mirrors the expected design so the integration point is zero-change when the
  real implementation lands.

- **OnboardingProject uses `/api/init/stream` (SSE), not `/api/init`**: The SSE chain doesn't
  natively accept a manager choice. The workaround: show `InitDialog` as a pre-flight, capture
  the chosen CLI, run the SSE chain (scaffold + openspec-init), then fire a follow-up
  `POST /api/init { manager: { command }, force: true }` to write `agents.yaml`. This is slightly
  redundant but keeps the SSE chain clean and avoids forking it.

- **`noUnusedLocals: true`** in tsconfig forced careful cleanup of imports. The `DoctorReport`
  and `Cli` type imports in `Settings.tsx` are used in the new `DefaultManagerSection`.

## Differently

- Would propose a dedicated `POST /api/init/stream` body extension for `manager.command` instead
  of the two-step SSE + follow-up POST. This would make OnboardingProject's flow atomic: one
  request yields both the scaffold events and `agents.yaml` creation.

- The `DefaultManagerSection` in Settings currently fetches `/api/doctor` independently. A shared
  Zustand slice holding the doctor report (loaded once on app mount and re-fetched on demand)
  would avoid the redundant fetch between Settings and InitDialog. This is a follow-up once
  `add-doctor-and-installer` lands and the endpoint stabilizes.

## Follow-ups

- When `add-doctor-and-installer` lands, **replace `server/doctor.ts` stub** with the real
  implementation. The interface contract is identical; it's a drop-in replacement.
- Extend `/api/init/stream` to accept `manager.command` so `OnboardingProject` can write
  `agents.yaml` atomically within the SSE chain (no follow-up POST needed).
- A shared `doctorReport` Zustand slice would let `InitDialog` and `Settings > Default Manager`
  share the cached report from the last fetch.
- CSS for `.init-dialog-*` classes needs to be added to `web/src/styles.css` before the dialog
  renders correctly in production. (The classes exist; the rules need authoring.)

## Rework round 2

Addressed 3 findings from review round 1:

- **F1 (medium — BUG fixed)**: Removed `errorMessage` from the `useEffect` dependency array in
  `OnboardingProject.tsx`. Introduced a closure-local `sseErrored` boolean flag that is set by
  the SSE error handler and used to gate the agents-yaml write. This eliminates the re-fire loop
  where React re-ran the effect on every `setErrorMessage(...)` call, potentially launching a
  second SSE chain with `errorMessage === null` in the new snapshot.

- **F2 (low — BUG fixed)**: Added `agentsYamlOnly: true` support to `POST /api/init`. When the
  flag is set, the handler skips `runInit` entirely and only runs the doctor gate +
  `writeAgentsYaml`. `OnboardingProject`'s follow-up POST now sends `agentsYamlOnly: true`
  instead of `force: true`, so the openspec/ scaffold written by the SSE chain is never
  overwritten. `InitProjectPayload` in `web/src/api.ts` and `InitBody` in `server/index.ts`
  were extended accordingly.

- **F3 (info — TODO documented)**: Added a `TODO(F3)` comment in `web/src/types.ts` above the
  `Cli` union explaining the intentional duplication with `server/doctor.ts`, the plan to add a
  compile-time guard when `add-doctor-and-installer` is archived, and the risk of silent drift.

All checks pass post-rework: `openspec validate --strict` VALID, `npm test` 446 pass (1
pre-existing `sharp` failure unrelated), `npm run typecheck` clean, `npm run build` clean.
