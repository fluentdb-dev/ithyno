# Outcome — add-kanban-search-filter

## ✅ Worked

- **Simple predicate covered the common case**. Case-insensitive
  substring match against `change.id`, `proposal.intent`, and any
  tag string catches the 90% "jump to this change" query. 8 unit
  tests in `Overview.test.ts` pin the predicate contract.
- **Local component state (no store slice) was the right call**.
  Filter is session-only and scoped to the Overview page — hoisting
  to zustand would have created a stale-state trap when the user
  navigated away and back.
- **Applied BEFORE `bucketize()` so column totals shrink with the
  filter**. Not just card visibility — the count in each column
  header reflects filtered cards. Users always see "how many
  matches" per column.
- **Puppeteer smoke confirmed all 4 spec scenarios**: filter input
  renders, typing narrows visible cards, Esc clears + blurs, Cmd+F
  focuses. Verified against Vite on port 5175 (main-tree UI).
- **Landed via parallel dispatch alongside light-dark-mode**. Both
  agents worked in independent worktrees simultaneously; kanban
  finished first (smaller scope) but merge order was still main
  → light-dark-mode → this change (kanban).

## ⚠️ Surprises

- **Spec's `proposal.title` doesn't exist as a field** — the shipped
  `ProposalDoc` type uses `intent`, which is what the card body
  surfaces. Agent A matched on `intent` and documented the
  deviation. Same for `tags[].name` — actual runtime is plain
  `string[]`, not `{name}` objects. Both deviations are semantic
  matches to the spec's intent ("what the user sees on cards") but
  the spec's field names diverged from the code. Retrofit the spec
  in a follow-up refresh if the ProposalDoc shape stabilises further.
- **Cmd+F preempt is scoped to Overview only** by binding the
  keydown listener in Overview's `useEffect`. On other pages the
  browser's native Find works unchanged. Design intent — user
  reviewed and confirmed Cmd+F hijack was acceptable on Overview.

## 🔁 Differently next time

- **Sync spec field names with actual code before propose**. The
  `title` / `tags[].name` mismatch was cheap here (agent caught it
  and adapted) but future proposals that hand-write field access
  should grep the type first.

## 🌱 Follow-ups

- **Highlight matched substring within cards** — small win, deferred
  in the propose "out of scope".
- **Multi-facet filter** (by phase, agent status, execution mode) —
  substring filter covers most cases; add if a real need emerges.
- **Filter on Agents page** — different UX (chronological list vs
  board); separate follow-up if requested.
- **Retrofit spec's field references** (`title` → `intent`,
  `tags[].name` → `tags[]`) in an in-place spec correction if the
  ProposalDoc type stays as-is.
