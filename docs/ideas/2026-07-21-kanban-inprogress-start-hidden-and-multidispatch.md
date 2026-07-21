---
title: Hide Kanban IN-PROGRESS Start button + integrate multi-dispatch into Start flow
date: 2026-07-21
status: idea
tags: [kanban, dispatch, ui, multi-dispatch, workflow]
---

## Context

Two related UI/workflow gaps surfaced during the multi-dispatch archive session on 2026-07-21 but were deferred (no time in the session).

## 1. Hide the "Start" button on IN-PROGRESS column cards

**Observation** (from screenshot of the current Overview): each card in the IN-PROGRESS column still shows a "Start" affordance (e.g., "Start ▼ (9)" bulk selector at the column header, or per-card "Start" button). But an IN-PROGRESS card by definition already has an agent job (or ready-to-start worktree state — see `add-orphan-worktree-adoption`). Showing Start is misleading and easy to misclick.

**Proposal (sketch):**
- On the IN-PROGRESS column, hide per-card Start; keep only affordances relevant to that state (Archive, View diff, Merge, Discard).
- Optionally hide the column-header "Start ▼ (N)" bulk selector when N is the IN-PROGRESS count (that selector is for bulk-starting TODO cards, not re-starting in-progress ones).
- Consider whether "restart an escalated agent" needs its own affordance (not called Start) if a phase went `needs-human`.

**Change name candidate**: `hide-start-in-progress-column`.

## 2. Multi-dispatch integration into the Kanban Start flow

**Observation**: `/ithy-opsx:dispatch-multi <id1> [id2] …` was landed by `add-multi-dispatch-orchestrator`, but the Kanban "Start" UI still injects the single-change form (`/ithy-opsx:dispatch <id>`) into the terminal. Bulk selection ("Start ▼ (9)") should route to dispatch-multi when >1 id is selected.

**Proposal (sketch):**
- When the user selects N cards from TODO and clicks "Start" (bulk mode), inject `/ithy-opsx:dispatch-multi <id1> <id2> ... <idN>` into the terminal instead of N separate `/ithy-opsx:dispatch` calls.
- Single-select (N=1) keeps the current single dispatch to avoid unnecessary manager overhead.
- Respect `agents.yaml.maxParallel` — the multi skill already caps concurrency; the UI should show the queue explicitly ("3 running, 6 queued") so users understand the schedule.
- Optionally: after dispatch-multi completes, offer a batch archive button that fires `/ithy-opsx:archive <id>` per completed change (respecting the `dispatch-multi` skill's design note that per-change archive stays a per-invocation gesture).

**Change name candidate**: `route-bulk-start-to-dispatch-multi`.

## Why capture and defer

Both are UI improvements that follow directly from `add-multi-dispatch-orchestrator` landing. Deferring them today because:
- Multiple in-flight proposals (add-preload-sandbox-import-guard, add-app-icon-branding) already stacked.
- Both touch `web/src/components/Kanban.tsx` — merging them together would be cleaner than incrementally.
- User's operational time was up.

## Suggested sequencing when picked up

1. `hide-start-in-progress-column` first (small, isolated UI cleanup)
2. `route-bulk-start-to-dispatch-multi` after (larger; requires wiring dispatch-multi command into the bulk-Start injection code path + UX around the queue)

Both should share a design pass on "what does 'Start' mean in each column and phase" so the affordances are consistent.
