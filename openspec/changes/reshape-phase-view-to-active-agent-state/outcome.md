# Outcome

## ✅ Worked

- **Bucket key shift from `phase` → active `role` cleanly separated the two
  concerns** the P1 view had conflated: persistence progress (`phase`) versus
  who is currently on the change (`role`). Once the two selectors
  (`jobByChange` for workers, `managerActivityByChange` for Manager fallback)
  were in place, `activeRoleFor(change, job, activity)` collapsed to 10
  lines and every scenario in the 12-item test list fell out naturally.
- **B2 (last-role persistence across `cleanup` / `transitioning`)
  server-side.** `setManagerActivity` preserves `prev.role` when the update
  omits it. This kept the UI-side bucketize dumb — no need to remember the
  last role in the client, the store already reflects a stable role until
  the Manager explicitly advances it.
- **Deprecation-tolerant body parser.** `parseManagerActivityBody` accepts
  both `role` (new) and `stage` (deprecated alias) and returns a
  `deprecatedStage: boolean` flag so the endpoint can log the deprecation
  exactly once per POST. No hard cutover, no client-side scramble.
- **`STANDARD_ROLES` filter (A1) is a one-liner** and makes it explicit
  that custom / `other` / `manager` roles never map to a Phase lane
  (Board view still shows them).

## ⚠️ Surprises

- **P1's `bucketizeByPhase` had a subtle contract we didn't notice until
  the reshape**: it dropped nothing (every change went somewhere,
  even when a lane was absent, via the shift-by-one fallback to DONE).
  `bucketizeByActiveRole` explicitly filters idle changes OUT — a
  behavior break the reshape's spec makes explicit ("Idle changes do
  NOT appear in Phase view"). P1's tests exercised the "no change is
  dropped" invariant; the reshape's test suite replaces that with
  positive assertions per scenario.
- **`ManagerActivityBadge` had a per-card `startedAt` elapsed-time
  ticker** that fed off React state. Removing the badge simplified
  the card render tree noticeably — one less re-render source per
  card per second. Not a perf issue at 20 cards; would have been at
  200.
- **Test file typecheck errors were the harder rename step**, not the
  source. The `.stage` → `.role` shape change surfaced in three test
  files (`server/manager-activity.test.ts`, `web/src/store.test.ts`,
  `web/src/components/PhaseLaneBoard.test.ts`) and the last needed a
  full rewrite because the function signature changed. The source-code
  rename was minutes; the test rewrite was hours.
- **P1 and P3 are still IN-FLIGHT (not archived)** so this reshape
  amends them via proposal-level `PARTIALLY SUPERSEDED` notes rather
  than PENDING annotations against a landed spec. This is the correct
  in-flight-target pattern (analogous to Case β) but felt unusual
  because the archived-target `PARTIALLY REVERTED` blockquote is far
  more common in this repo's history.

## 🔁 Differently

- **We could have shipped the reshape as a delta ON TOP of P1 rather
  than a standalone change.** In the end this would have required
  restructuring P1's spec entries mid-flight, which the OpenSpec CLI
  handles poorly. The standalone-change-with-supersession-note
  approach kept P1's history intact.
- **Manager fallback semantics deserved a design doc.** The B2 policy
  ("cleanup keeps last role") and A1 ("standard 4 only") were
  hashed out in chat; landing them as principles-in-`design.md`
  next time would save someone else the archaeology.

## 🌱 Follow-ups

- **VERIFYING lane availability when no verify agent is declared.**
  `deriveLaneList` still gates the lane on "at least one agent
  declares `verify`". If Manager is falling back for verify (A2),
  the change is invisibly dropped to DONE. Should relax: also
  include the lane when ANY `managerActivity.role === "verify"` is
  currently active. Small follow-up; not blocking.
- **PROPOSING lane end-to-end.** The reshape adds `"propose"` to
  ManagerRole but there's no worker path that dispatches with
  `role: "propose"` yet — `/ithy-opsx:propose` runs synchronously in
  the Manager PTY today. When Phase 5+ threads propose through a
  worker job, PROPOSING lane will populate; until then it's an
  empty lane whenever agents declare `propose`.
- **KanbanCard test coverage of "no badge" is implicit** (the badge
  component doesn't exist to import). A regression that
  reintroduces the badge would only fail if a test explicitly
  imports the removed component. Consider a `screen.queryByRole` /
  `queryByText` negative assertion in KanbanCard.test.ts next time
  the KanbanCard grows a new adornment.
- **`spinner-rot` keyframe removal** — the CSS cleanup deleted the
  keyframe because the badge was its only consumer. If any other
  component grows a spinner, they'll need to re-declare the
  keyframe. Minor.
