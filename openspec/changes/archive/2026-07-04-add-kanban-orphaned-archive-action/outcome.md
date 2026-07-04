# Outcome: add-kanban-orphaned-archive-action

## ✅ Worked

- **Archive button on orphaned worktree card** is the natural
  entry point for the "runner adopted an old worktree at startup"
  case. Before this change, an orphaned card's actions were only
  View diff / Merge / Discard — Archive was gated on `column ===
  "done"` (all tasks ticked). If the orphaned change was already
  100% done, its Archive gesture required a two-step navigation
  (open the change, tick task if needed, hope done column picks it
  up). Now it's one click.
- **Merge button demoted to `ghost`** so the visual weight matches
  intent — Archive (Claude-driven full flow) reads as primary,
  Merge (raw git command) reads as secondary.
- **`onArchive` prop threaded through** TODO / IN-PROGRESS columns
  (previously done-only). Small refactor, exposed the callback
  where the orphaned card actually lives.

## ⚠️ Surprises

- **Gate is `orphaned` specifically, not `isPendingMergeOrDiscard`.**
  Realized mid-session that `completed` / `crashed` / `cancelled`
  cards also benefit from a direct Archive path, and the change
  DID scope creep to add that — but decided to hold. Follow-up
  proposal `extend-kanban-post-run-archive` (unwritten) would
  swap the gate to `isPendingMergeOrDiscard`. Left as-is here so
  the change ships small.

## 🔁 Differently

- Considered making Archive the ONLY action for orphaned (removing
  Merge / Discard) since `/ithy-opsx:archive` internally covers
  merge + archive. Rejected: users who want to review the merge
  in isolation still want a Merge button, and Discard is the
  escape hatch when the worktree is broken. Keep both.

## 🌱 Follow-ups

- **`extend-kanban-post-run-archive`** — extend Archive gate from
  `job?.status === "orphaned"` to `isPendingMergeOrDiscard(job)`
  so completed / crashed / cancelled cards get the same one-click
  Archive path.
- **Icon vs text label parity.** Merge / Discard use text; Archive
  also text but with a slightly different weight class now. Would
  read cleaner with a small icon glyph next to each. Deferred.

## 📋 Verify notes

- §5.1 not tested this session — the running-state guard is
  covered by existing Start-button behavior; add-parallel-start-
  launcher's tests exercise the "no Start when job is active" path.
- §5.2 not tested with a restarted server this session — the
  orphaned adoption path was exercised earlier in the session
  (multiple orphan changes visible in Kanban), and the Archive
  button rendered correctly.
- §5.3 not tested via full modal flow — the Archive button click
  routes through the existing `/ithy-opsx:archive` inject path
  which is the same code as the done-column Archive.
- §5.4 not tested end-to-end this session — skill flow runs as
  its own change (`add-ithy-opsx-archive`) and is verified on
  its own.
- §5.5 not tested — post-run non-orphaned cards are the case the
  follow-up `extend-kanban-post-run-archive` addresses.
