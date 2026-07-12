# Outcome: revert-kanban-ui-lanes

## ✅ Worked

- **Kanban restored to the original 3 columns.** Progress-derived
  TODO / IN-PROGRESS / DONE, `change.phase` ignored on the board. The
  Manager still reads/writes `phase:` server-side; only the UI reverts.
  ~120 LOC of Kanban.tsx deleted (`PhaseLane`, `UnphasedSection`,
  `WaitBadge`, `formatWait`, phase-based slot logic, needs-human
  branches).
- **PENDING annotation convention landed.** Codified in CLAUDE.md and
  `openspec-flow/SKILL.md` and applied inline to the 3 target
  requirements. `openspec archive` will strip the annotations along
  with the requirements themselves — self-cleaning.
- **Reverted-target proposals annotated.** Added a REVERTED /
  PARTIALLY REVERTED blockquote at the top of
  `add-kanban-phase-lanes` and `add-phase-state-machine` archives so
  a git-log-blind reader sees the disposition inline.
- **Tests survived cleanly.** 238 → 233 (Kanban.test.ts rewritten
  from 11 phase-based tests to 6 progress-based tests, plus one
  explicit "phase is ignored" assertion). typecheck / build clean.

## ⚠️ Surprises

- **`docs/2026-07-06-phase-2-implementation-and-redesign.md` was
  itself out of alignment with the "3 columns" principle.** That doc
  captured the design compromise "keep WaitBadge as a card head
  marker" — but the actual principle (established later in
  conversation) is "no phase-derived UI at all". This is the risk
  the user surfaced: docs are snapshots, not principles. See the
  new CLAUDE.md `## In-flight spec 注記` for the propose-time hook
  that closes this gap for spec artifacts.
- **`add-opsx-revert-command`** got scheduled as task #101 during
  this change. The manual work here (3 annotations + delta + skill
  update) is exactly what a `/opsx:revert <scope>` slash command
  should automate, and doing it by hand once made the shape obvious.

## 🔁 Differently

- **Should have added the PENDING convention BEFORE landing
  `revert-active-phase-ui`.** That prior revert also removed
  requirements in-flight and the same window-of-misreading applied.
  Not fixable retroactively (those requirements are already gone),
  but a lesson for `add-opsx-revert-command` — make the convention
  a Hard rule so no revert lands without it.
- **The commit history preserves the phase-lane experiment.**
  Nothing to un-remember. The archived proposals now carry a
  visible "reverted" marker, which is the right level: history
  intact, disposition transparent.

## 🌱 Follow-ups

- **`add-opsx-revert-command`** (task #101) — automate the 4
  manual steps this change did: (1) `openspec new` with
  `revert-<scope>` naming, (2) generate delta headers, (3)
  insert PENDING annotation in current spec, (4) insert REVERTED
  annotation in Case α target archives.
- **Consider a `docs/principles.md`** distinct from settled-direction
  docs — hosting the short-form rules like "看板 = 3 列のみ" so
  they're consulted before design docs. Right now those principles
  are scattered across long design docs and easy to miss.
- **Prune unused client types.** `Change.phase` / `priorPhase` /
  `escalatedAt` / `needsHumanQuestion` are still on the client type
  in case a non-Kanban surface consumes them. If Phase 5.2 / 5.3
  don't, they can be trimmed.
