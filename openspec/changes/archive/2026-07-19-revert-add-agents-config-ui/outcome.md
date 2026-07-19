# Outcome — revert-add-agents-config-ui

## ✅ Worked

- **Fourth Case β retirement in a row.** Same flow as the three
  earlier reverts today (refine, add-manager-agent-config,
  add-agent-initial-input): delete the target's `specs/`, rewrite
  `outcome.md`, `openspec archive <target> --yes`, then archive
  the revert.
- **Gap-focused ADDED requirement.** Rather than duplicate the
  substantial Modal coverage in `Agents Config Modal Layout
  Ergonomics` (line 1291), this revert only spec'd the two
  entry-point behaviors that had no home elsewhere: the Delete
  confirmation dialog and the `[+ Add agent]` button existence.
  Adjacent, non-overlapping coverage — future readers can find
  Modal internals in one place and row-level scaffolding in
  another.
- **No code changes.** `Agents.tsx` still renders
  `DeleteConfirmDialog` and `[+ Add agent]`; `AgentConfigModal.tsx`
  still opens on Add / Edit. Existing kebab-case test suite
  unaffected.

## ⚠️ Surprises

- **Four Case β reverts in one day, all following the same
  pattern.** Each of `refine-agents-config-modal`,
  `add-manager-agent-config`, `add-agent-initial-input`, and
  `add-agents-config-ui` was in-flight for weeks past a set of
  landed changes (`reshape-agents-yaml-mode-roles`, the
  runtime-collapse revert series, and today's revert-refine) that
  ate large portions of their deltas. The pattern seems to be:
  when a proposal survives past a bigger architectural change,
  the delta ages fast. Worth watching for a similar cluster in
  the Phase 6 escalation series (95-98) that's still pending.
- **The four target proposals were all authored 2026-06-30 to
  2026-07-06**, then partially superseded by
  `reshape-agents-yaml-mode-roles` (2026-07-14). A one-shot
  policy — "reshape landed; audit all in-flight changes touching
  agents.yaml or the Modal" — would have caught this drift
  three-plus weeks ago.

## 🔁 Differently next time

- **When a large refactor lands** (reshape-style), open a "audit
  active changes for drift" idea capture in `docs/ideas/` on the
  same day. Would have surfaced these retirements as a batch
  earlier.

## 🌱 Follow-ups

- **Phase 6 escalation series (95-98)** may need a similar audit
  since they've been pending for a while and touch UI surfaces
  that reshape may have changed.
- **Consolidate the "Agents Config" spec cluster** into a single
  canonical section — `Modal Layout Ergonomics` + `Live Updates`
  + `Delete Confirmation And Add Button` + `Singleton Guard` +
  `Listed With Other Agents` are 5 requirements in 4 different
  parts of `dashboard/spec.md`. A future refactor could co-locate
  them.
