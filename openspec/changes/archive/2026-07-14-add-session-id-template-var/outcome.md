# Outcome — add-session-id-template-var

Added `${session_id}` as a fourth template variable — change-scoped,
server-persistent — for Worker CLIs that support a `--session` flag
(Claude Code, gh copilot, …). Landed on `phase-workflow` across 2
commits (propose, impl).

## ✅ Worked

- **File-backed persistence is dead simple.** `.ithyno/sessions.json`
  as `{ changeId → sessionId }`, atomic `.tmp + rename`, no schema
  version needed. Survives server restart trivially because the
  store is the source of truth.
- **Body-override + store-fallback resolution is orthogonal and
  testable.** `dispatch()`'s session step reduces to a 3-line
  ternary at the top of the handler; each branch is verified in
  isolation by the dispatch-session test suite (4 tests).
- **Mint-before-validation semantics matched the user's intent
  immediately.** "Non-existent changeId still mints" felt weird
  when I first considered it, but the user confirmed the tradeoff:
  simplicity > cleanliness. The resulting orphan entries are
  harmless and user-cleanable.
- **`.ithyno/` scoping is naturally per-project.** Two dashboards
  on different repos get independent stores with no config.
- **Job.sessionId piped through cleanly.** `runner.run()` accepts
  an optional trailing `sessionId?: string` — a purely additive
  API change that the reshape's tests continued to pass unchanged.

## ⚠️ Surprises

- **First draft assumed "PTY session lifetime" as the grouping
  unit.** The initial proposal minted a session ID at
  `attachPtyToSocket` and had it die when the Terminal panel
  closed. User clarified that they wanted a **persistent** ID that
  survives server restart — "same change → same session
  identity." That flip halved the proposal (dropped all the PTY
  hooks) and made the store per-change instead of per-PTY.
- **Discovered the cli-arg prompt injection regression while
  verifying end-to-end.** The user's live `agents.yaml` had
  migrated to `prompts.code: ...` (via Modal edits) but their
  `args: [--dangerously-skip-permissions]` didn't contain `-p`.
  Running the resolve() locally showed the prompt was
  never delivered. That fix landed adjacent to this change (357aaae)
  because the verify pass surfaced it — the fix conceptually
  belonged to the reshape change but the timing was tied to this
  one's verify session.
- **Manager PTY has no natural sessionId.** The design leaves
  `${session_id}` in Manager `initialInput` substituting to the
  empty string. Feels awkward but is correct: the Manager isn't
  scoped to any particular change, so there's no meaningful ID to
  hand it. Users who want their Manager Claude Code session to
  carry a stable ID pass it explicitly via `curl` in their own
  dispatches.

## 🔁 Differently

- **Should have asked about "session grouping unit" upfront.** The
  first proposal draft consumed a real turn's worth of writing
  before I asked and got redirected. The clarifying question
  (`AskUserQuestion` with 4 options) took 30 seconds and saved
  the second draft from making the same mistake.
- **The corrupt-file recovery path (warn + treat as empty +
  overwrite on next mint)** is deliberately lenient. If a user
  hand-edits `sessions.json` into invalid JSON, they get a warning
  in the server log and the file is silently repaired on the next
  dispatch. This is friendly but could mask a real bug someday.
  Worth revisiting if `sessions.json` starts carrying more than
  just the change → id mapping.

## 🌱 Follow-ups

- **UI surfacing.** The Kanban card head or the Live-section row
  could render the current session ID for each change so users can
  cross-reference with their Claude Code session history. Nice to
  have; not required for this change.
- **Explicit reset action.** No `POST /api/agents/sessions/reset`
  or UI button yet — users hand-edit `.ithyno/sessions.json` to
  clear a specific entry. If reset becomes a common request,
  either a small endpoint or a per-change UI action fits.
- **Cross-cutting `${session_id}` in Manager initialInput.** The
  current design substitutes to empty for Manager. If a real user
  need emerges for "Manager also gets a session ID" — e.g. a
  Manager-level PTY session persistent across restarts — we'd
  need a separate `session-manager.json` or extend the current
  store with a reserved `_manager` key.
- **Orphan cleanup.** `sessions.json` may accumulate entries for
  changes that no longer exist (archived, deleted). A tiny
  garbage-collector that drops entries whose `openspec/changes/<id>/`
  is absent would keep the file tidy. Deferred — the file is
  small and never hot-read.
