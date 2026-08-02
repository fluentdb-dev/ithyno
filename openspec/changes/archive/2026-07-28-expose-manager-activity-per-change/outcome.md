# Outcome: expose-manager-activity-per-change

## ✅ Worked

- **`server/manager-activity.ts`** (new): in-memory `Map<changeId, ManagerActivity>` plus
  `setManagerActivity` / `clearManagerActivity` / `getManagerActivity` /
  `getAllManagerActivities` / `resetManagerActivities` (test helper) and
  `parseManagerActivityBody` (the endpoint's 400-path guard, split out so it is
  unit-testable without Fastify). `setManagerActivity` returns the stored record
  or `null` on an idle-clear — that return value *is* the WS broadcast payload,
  so the handler never needs a second lookup.
- **`server/index.ts`**: `POST /api/manager/activity` (session-token gated,
  401 → 400 → 200 order, broadcasts `manager-activity-updated` on every accepted
  write) and `GET /api/manager/activity` (bulk snapshot, same gate). New
  `ServerEvent` arm added to the union.
- **`server/sync/pty.ts`**: exports `ITHYNO_SESSION_TOKEN` into the terminal
  PTY's environment. See "Surprises" — this was the missing link that made the
  whole feature actually reachable from the Manager.
- **Skills**: `.claude/commands/ithy-opsx/dispatch.md` gained a
  "Manager activity publication" section (the `postManagerActivity` helper, the
  token prerequisite, and the posting rules) plus six inline boundary posts;
  `.claude/skills/ithy-opsx-dispatch-multi/SKILL.md` gained the same contract
  with per-`changeId` routing and a boundary table;
  `.claude/commands/ithy-opsx/dispatch-multi.md` gained the summary bullet.
- **Client**: `ManagerActivity` / `ManagerActivityUpdatedEvent` in `types.ts`,
  `fetchManagerActivities()` in `api.ts`, `managerActivity` record +
  `setManagerActivity` action + `loadManagerActivities` + the WS branch in
  `store.ts`, `<ManagerActivityBadge>` (new component) and a 3-line additive
  edit in `KanbanCard.tsx`, badge/spinner CSS in `styles.css`.
- **Tests**: `server/manager-activity.test.ts` (34 cases — round-trip, idle-as-clear,
  bulk snapshot independence, body validation, token gating, one-broadcast-per-post),
  `web/src/components/ManagerActivityBadge.test.ts` (one case per activity variant +
  elapsed formatting + the two spec scenarios), and six new cases appended to
  `web/src/store.test.ts` for WS routing.
- Gates green: `openspec validate --strict` VALID · `typecheck` clean ·
  `npm test` 573 passed (1 pre-existing `sharp` / Node 25.8 failure in
  `scripts/build-icons.test.mjs`, unrelated) · `build` success.

## ⚠️ Surprises

- **`ITHYNO_SESSION_TOKEN` did not exist anywhere in the repo.** Task 3.4 said
  "the Manager PTY should have this set from the ithyno launch — verify or add a
  fetch-from-config step", and the verification came back negative: the PTY spawns
  with `{ ...process.env, TERM }` and the token only ever appeared in the launch
  URL. Without it the entire feature would have been dead on arrival — every
  `postManagerActivity` call would 401. Fixed by exporting `SESSION_TOKEN` into
  the PTY env (one import + one env key in `server/sync/pty.ts`). The exposure is
  nil-delta: the PTY is already local-only and token-gated at the WS upgrade, and
  the shell it spawns is the user's own.
- **The repo has no jsdom / React Testing Library and vitest only globs
  `*.test.ts`** (`include: ["server/**/*.test.ts", "web/src/**/*.test.ts",
  "scripts/**/*.test.mjs"]`, `environment: "node"`). Task 7.1 asked for
  `ManagerActivityBadge.test.tsx`, which would never have been collected. Wrote
  `ManagerActivityBadge.test.ts` instead and pushed the render decisions into
  exported pure helpers (`activityLabel`, `formatElapsed`, `activityTitle`) —
  the same shape every other component test in this repo uses
  (`Kanban.test.ts`, `PhaseLaneBoard.test.ts`, `InitDialog.test.ts`).
- **`server/index.ts` cannot be imported by a test** — it starts a listening
  Fastify instance at module load. Task 2.4's "endpoint tests" therefore model
  the handler's decision tree over the real primitives (`verifyToken` +
  `parseManagerActivityBody` + `setManagerActivity`) rather than driving HTTP.
  This mirrors how `doctor.test.ts` covers its own 400-path guard. The guard
  logic itself is genuinely shared code, so the coverage is real; only the
  Fastify wiring is untested.
- **TypeScript would not narrow the icon lookup** from the `label !== null`
  check — `activityLabel` returning `null` for `idle` is not a type-level
  narrowing of `activity.activity`. Needed an explicit
  `if (activity.activity === "idle") return null` guard.

## 🔁 Differently

- **`startedAt` is preserved across a re-post of the same `stage` + `activity`.**
  Not in the tasks, but without it a skill that refreshes `waiting`'s detail with
  an elapsed hint (explicitly left to skill-author discretion by the proposal)
  would reset the badge's own elapsed clock every time. Costs four lines and one
  test; documented in the module and in the skill's posting rules.
- **`stage` is optional on an `idle` post.** The spec's own scenario posts
  `{ changeId: "x", activity: "idle" }` with no stage, so requiring it uniformly
  would have failed the spec. `parseManagerActivityBody` requires `stage` for the
  five non-idle activities and accepts (but does not require) it for `idle`.
- **`cleanup` with no detail renders `"cleanup"`, not `"cleanup: "`.** The spec
  writes `"cleanup: ${detail ?? ''}"` literally; a dangling colon looked like a
  render bug. Every scenario in the spec supplies a detail, so the observable
  behavior is unchanged.
- **The badge owns its own 1-second timer** rather than having `KanbanCard`
  re-render on a shared clock. The interval mounts only while a badge is visible,
  which keeps the "no dispatch running" case (the common one) at zero timers.
- **Kept the `KanbanCard.tsx` edit to 3 lines** (import, `useStore` selector,
  one element after `</Link>`) because `annotate-cards-with-worker-job-state` is
  editing the same file concurrently. The touched regions are disjoint from the
  card head where the job badge lives.

## 🌱 Follow-ups

- **Manual verification (tasks 8.5 / 8.6 / 8.7) is still open.** All three
  require a live server plus a Manager PTY actually running a dispatch, which a
  worktree code worker cannot do. Left unticked deliberately. 8.7 (restart →
  `{}`) is the cheapest to confirm and is already covered in spirit by the
  "fresh map returns `{}`" unit test.
- **No server-side staleness sweep.** If a Manager is killed mid-dispatch
  (`kill -9` on the PTY, laptop sleep), its last badge sticks until the server
  restarts or someone posts `idle`. The skills now mandate a clear on every exit
  path, but that only covers graceful exits. A TTL (e.g. drop entries whose
  `startedAt` is older than the 30-minute dispatch ceiling) would close the gap
  cheaply — deferred because it adds a timer to a module that currently has none.
- **The dispatch skills are prose, so the boundary posts are unenforceable.**
  Nothing fails if a future edit drops one. If the badges prove valuable, the
  natural hardening is to move the post into a small script the skill invokes
  (`scripts/manager-activity.sh`) so the boundary set lives in one testable place.
- **`web/src/components/ManagerActivityBadge.tsx` is untested at the render
  level**, like every other component here. Bringing in jsdom + RTL is a
  repo-wide decision worth making once, not as a rider on this change.
- **The elapsed suffix caps at hours.** A dispatch stuck for over a day shows
  `27h`; fine for now, but if the staleness sweep above lands, this becomes moot.
