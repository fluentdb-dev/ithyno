# Outcome — hide-run-on-verify-only

## ✅ Worked

- The predicate stayed as small as promised: `hasNonVerifyWork(tasks)`
  is a few lines in `web/src/util/changeState.ts`, a case-insensitive
  substring match on section titles for `"verif"`.
- The gate integrated into the Kanban card's Start rendering
  cleanly — replace the button with a `<span class="kanban-verify-only">verify
  only</span>` when the predicate is false. The `.kanban-verify-only`
  style is a muted italic pill; matches the muted vocabulary the rest of
  the card already uses.
- The predicate is reused elsewhere as the codebase grew: the
  ExecutionPicker's Start pre-check, ChangeDetail's Start gate, and the
  ParallelStartLauncher's candidate filter all read it. One helper,
  four call sites — worth the extraction.

## ⚠️ Surprises

- The "verify" substring match is more permissive than we thought
  at proposal time. Any section title containing the substring counts,
  including things like `## 11. Verification (manual)` or
  `## 8. Verify server behavior`. That's the desired behavior — this
  change deliberately did not enumerate an allow-list — but worth
  remembering when writing new tasks.md sections.
- Docs sections (`## 8. Docs`) are treated as **non-verify** work by
  design. That surfaced later when the parallel-start launcher counted
  a change with only "Docs" tasks left as startable. See the
  discussion in `add-parallel-start-launcher`'s conversation — not a
  bug here, but a consequence of the predicate's definition to keep in
  mind.

## 🔁 Differently

- Considered warning the user (rather than hiding the button) — "you
  can Run but only verify tasks remain." Rejected in favor of hiding:
  the hint pill communicates the state without inviting a wasted
  spawn.
- No `.opsx.yaml` config knob for the section-title convention. Kept
  hard-coded because `verif` is the OpenSpec convention already; a
  config would be a solution in search of a problem.

## 🌱 Follow-ups

- If a project team wants to also skip `## Docs`-only changes (i.e.
  treat docs as "not agent work"), that's a different policy on top of
  this one. Not proposed here; the launcher change surfaces the same
  question and defers it too.
- The muted-italic pill uses a bespoke class instead of the shared
  `action-badge` shape. If more "explanation instead of action" states
  appear (verify-only, waiting-on-user, etc.), consolidating them is
  worth a small polish pass.
