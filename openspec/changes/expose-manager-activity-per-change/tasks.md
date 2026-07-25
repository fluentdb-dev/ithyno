# Tasks

## 1. Server — ManagerActivity state

- [ ] 1.1 Create `server/manager-activity.ts` with:
  - Type `ManagerActivity = { changeId: string; stage: "code" | "review" | "verify"; activity: "dispatching" | "waiting" | "judging" | "cleanup" | "transitioning" | "idle"; startedAt: number; detail?: string }`.
  - In-memory `Map<string, ManagerActivity>`.
  - Exports: `setManagerActivity(update)`, `clearManagerActivity(changeId)`, `getManagerActivity(changeId)`, `getAllManagerActivities()`.
- [ ] 1.2 Unit tests `server/manager-activity.test.ts` — set/get/clear round-trip; setting `activity: "idle"` is equivalent to clear.

## 2. Server — HTTP endpoint

- [ ] 2.1 `POST /api/manager/activity` in `server/index.ts` — session-token gated. Body validation: `changeId: string, stage: enum, activity: enum, detail?: string`. Invalid → 400.
- [ ] 2.2 On success, call `setManagerActivity` (or `clearManagerActivity` when `activity === "idle"`), then broadcast WS event `manager-activity-updated` with `{ changeId, activity: ManagerActivity | null }`.
- [ ] 2.3 New endpoint `GET /api/manager/activity` — returns `Record<changeId, ManagerActivity>` for initial client load. Session-token gated.
- [ ] 2.4 Endpoint tests: shape validation, token gating, broadcast firing.

## 3. Dispatch skill — publish at boundaries

- [ ] 3.1 Edit `.claude/commands/ithy-opsx/dispatch.md`. Add a helper snippet near the top that defines a `postManagerActivity` bash function calling the endpoint:
  ```bash
  postManagerActivity() {
    curl -sS -X POST http://localhost:4321/api/manager/activity \
      -H 'content-type: application/json' \
      -H "X-Session-Token: $ITHYNO_SESSION_TOKEN" \
      -d "$1"
  }
  ```
- [ ] 3.2 Insert `postManagerActivity` calls at each phase boundary in the dispatch flow:
  - Just before "Dispatch" step (spawn): `activity: "dispatching"`.
  - Just after spawn returns and the poll loop begins: `activity: "waiting", detail: "<agent-name>"`.
  - When a worker report arrives and Manager starts inspecting: `activity: "judging"`.
  - When Manager runs despawn / worktree cleanup: `activity: "cleanup", detail: "<step>"`.
  - When Manager writes phase update: `activity: "transitioning"`.
  - At end of dispatch (success, escalation, or timeout): `activity: "idle"` (which server treats as clear).
- [ ] 3.3 Same additions in `.claude/commands/ithy-opsx/dispatch-multi.md` (and its skill body if separate) — with per-change routing so each activity update carries the correct `changeId`.
- [ ] 3.4 Document the `ITHYNO_SESSION_TOKEN` env prerequisite in the dispatch skill's preamble (the Manager PTY should have this set from the ithyno launch — verify or add a fetch-from-config step).

## 4. Client — store + types

- [ ] 4.1 `web/src/types.ts`: add `ManagerActivity` type (mirror of server).
- [ ] 4.2 `web/src/store.ts`: add `managerActivity: Record<string, ManagerActivity>` field, initialized to `{}`.
- [ ] 4.3 Add store action `setManagerActivity(changeId, activity | null)` — writes to the record; null clears the entry.
- [ ] 4.4 WS message handler: on `manager-activity-updated`, dispatch `setManagerActivity(payload.changeId, payload.activity)`.
- [ ] 4.5 On store init / reconnect, fetch `GET /api/manager/activity` and populate the record.

## 5. API helper

- [ ] 5.1 `web/src/api.ts`: add `fetchManagerActivities(): Promise<Record<string, ManagerActivity>>` calling `GET /api/manager/activity`.

## 6. KanbanCard render

- [ ] 6.1 `web/src/components/KanbanCard.tsx`: read `useStore((s) => s.managerActivity[change.id])`. If defined, render a secondary `<ManagerActivityBadge>` below/beside the existing worker-state indicator (from Phase 2).
- [ ] 6.2 `<ManagerActivityBadge>` (new file `web/src/components/ManagerActivityBadge.tsx`):
  - `dispatching` → spinner (CSS animation) + "dispatching"
  - `waiting` → static hourglass icon + "waiting" + optional `detail`
  - `judging` → brain / thinking icon + "judging"
  - `cleanup` → broom / trash icon + `"cleanup: ${detail ?? ''}"`
  - `transitioning` → arrow-right icon + "transitioning"
  - Elapsed time (from `startedAt`) shown as a small muted suffix.
- [ ] 6.3 CSS in `web/src/styles.css` — `.manager-activity-badge`, `.mgr-activity-icon`, `@keyframes spinner-rot`.

## 7. Tests

- [ ] 7.1 `web/src/components/ManagerActivityBadge.test.tsx` — one test per activity variant.
- [ ] 7.2 `web/src/store.test.ts` — WS message routes to `setManagerActivity`; null clears; multiple changes coexist.

## 8. Verification

- [ ] 8.1 `npm run openspec -- validate expose-manager-activity-per-change --strict` passes.
- [ ] 8.2 `npm test` passes (accepting the known-unrelated `scripts/build-icons.test.mjs` failure on Node 25.8).
- [ ] 8.3 `npm run typecheck` passes.
- [ ] 8.4 `npm run build` passes.
- [ ] 8.5 Manual: dispatch a change with `/ithy-opsx:dispatch <id>` (from a Manager PTY that has `ITHYNO_SESSION_TOKEN` set) → observe Kanban card showing "dispatching" → "waiting for claude" (with elapsed) → "judging" → "cleanup: despawn" → "transitioning" → badge clears when dispatch completes.
- [ ] 8.6 Manual: `dispatch-multi` on 2 changes → both cards show independent activity badges throughout their independent timelines.
- [ ] 8.7 Manual: kill the ithyno server mid-dispatch → restart → `GET /api/manager/activity` returns `{}` (in-memory only, no restoration). Dispatch resumes if Manager continues; new activity posts populate the state again.
- [ ] 8.8 Write `openspec/changes/expose-manager-activity-per-change/outcome.md`.
