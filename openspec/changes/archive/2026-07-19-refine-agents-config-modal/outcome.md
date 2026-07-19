# Outcome: refine-agents-config-modal (reverted)

**Reverted by [revert-refine-agents-config-modal](../revert-refine-agents-config-modal/) — 2026-07-19.**

The impl code refine landed is NOT reverted; the server-side
manager guards remain in effect and are re-covered by
`revert-refine-agents-config-modal`'s ADDED requirement
`Manager Agent Server-Side Singleton Guard`. Only the openspec spec
delta was retired — see the revert's `proposal.md` for the full
rationale (MODIFIED target no longer exists in current spec;
several ADDED requirements obsoleted by
`reshape-agents-yaml-mode-roles` and
`revert-manager-agent-config`).

The original outcome sections are preserved below for history.

---

## ✅ Worked

- **initialInput field closes the Phase 5.2 gap.** Users can now set
  the auto-inject line (`/opsx:manage` for Manager, `/ithy-opsx:apply
  ${change_id}` for code workers) from the UI. The placeholder
  switches by role so users see a sensible hint without reading docs.

  *(Note: obsoleted by `reshape-agents-yaml-mode-roles` — the
  initialInput textarea was folded into per-role `prompts:`
  textareas.)*

- **Manager singleton enforced at 3 layers**: loader (2+ managers
  fail load), server writer (upsert-that-would-be-2nd → 400), and
  client modal (Add-mode role dropdown filters out `manager` when
  one exists). Any of the three alone would be a leaky guard;
  belt-and-braces here matches how the earlier config-writer /
  registry pair validates payloads.

  *(Note: the server-side layers remain in effect and are
  independently re-covered by the revert's ADDED requirement. The
  client-side dropdown filter is obsoleted by the chip multi-select
  from `reshape-agents-yaml-mode-roles`.)*

- **Manager row's Delete button vanishes cleanly** via a
  one-line `canDelete = agent.role !== "manager"` check. Server-side
  reject with a clear message means even a hand-crafted API call
  can't accidentally strip the Manager.

  *(Still in effect.)*

- **`add-manager-agent-config`'s "picks the first" fallback is
  gone** — the scenario that documented the ambiguity is replaced
  with an explicit `agents[1]` error. Tightening a just-landed spec
  is a smell (should've caught it in the propose), but the PENDING
  annotation makes the transition visible for anyone reading the
  spec today.

  *(Superseded — `add-manager-agent-config` was itself reverted by
  `revert-manager-agent-config`, so the "picks first vs error"
  distinction is moot.)*

## ⚠️ Surprises

- **The `!isAdd && seed !== "new"` idiom is redundant** to TypeScript
  but not obviously so — TS narrows `seed` in the second check
  independently of `isAdd`. Cut to just `seed !== "new"` since that's
  the actual load-mode gate.
