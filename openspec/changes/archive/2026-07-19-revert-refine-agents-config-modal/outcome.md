# Outcome — revert-refine-agents-config-modal

## ✅ Worked

- **Case β pattern applied cleanly.** refine-agents-config-modal
  had `openspec archive` fail because its `MODIFIED` target `Manager
  Role In agents.yaml` was long gone from the current spec
  (removed by `revert-manager-agent-config` back on 2026-07-15).
  Rather than rewrite refine's delta post-hoc, retired it wholesale:
  refine's `specs/` deleted → `outcome.md` rewritten to point at
  this revert → `openspec archive refine-agents-config-modal --yes`
  moved it to `archive/2026-07-19-refine-agents-config-modal/`
  without applying any delta to `openspec/specs/dashboard/spec.md`.
- **Server-side guard behavior stayed authoritative.** The
  singleton and delete-rejection guards refine landed in
  `config-writer.ts` and `registry.ts` were manually verified via
  curl 2026-07-19 (`POST /api/agents/config` delete-manager +
  upsert-second-manager both return HTTP 400 with the documented
  error messages, `agents.yaml` unchanged). Rather than leave
  those behaviors unspecified after retiring refine's delta, the
  revert's ADDED requirement `Manager Agent Server-Side Singleton
  Guard` captures exactly what the code enforces today. No spec
  gap opens.
- **No code changes.** The impl code that refine landed remains in
  place; only the openspec artifact was retired.

## ⚠️ Surprises

- **`openspec validate refine-agents-config-modal` failed after
  deleting `specs/`** with "no deltas". Expected in Case β — the
  target's specs are supposed to be gone by the time archive runs.
  Non-blocking; `openspec archive --yes` proceeded and emitted the
  same as a non-blocking warning.
- **`add-manager-agent-config` was itself already reverted** on
  2026-07-15. The full chain is `add-manager-agent-config` (added
  `Manager Role In agents.yaml`) → `revert-manager-agent-config`
  (replaced it with `Manager Agent Listed With Other Agents`) →
  `reshape-agents-yaml-mode-roles` (reshape) → now this revert
  (retires refine's stale delta). Reading the chain top-down is
  the fastest way to understand today's manager spec state.

## 🔁 Differently next time

- **Catch drift earlier.** If refine had validated post-reshape
  the "MODIFIED target not found" would have surfaced immediately
  and prompted this cleanup weeks ago instead of at archive time.
  Not a general lesson — this cluster of manager-refactor changes
  was unusually thrashy.

## 🌱 Follow-ups

- **Post-reshape UI-level manager singleton rules** (chip
  multi-select behavior around `manager`) are currently
  unspecified. If a future user submits a chip multi-select with
  `manager` chip added twice or with two agents both containing
  the `manager` chip, the server guard catches it, but the UI
  contract is unwritten. Address in a follow-up refine-<scope>
  change if it becomes a real pain point.
- **`add-modal-command-picker-and-presets`** (still active,
  1/33 tasks) will layer on top of the post-reshape modal — if it
  touches manager UI, that would be the right moment to codify
  the singleton chip behavior above.
