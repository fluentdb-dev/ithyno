# Outcome — reshape-agents-yaml-mode-roles

Collapsed the Phase-3-era `shape: legacy | runtime-backed` split into
two orthogonal primitives — `mode: single-prompt | live-shell` and
`roles: string[]` — and reshaped the Modal accordingly. Landed on
`phase-workflow` across 4 commits (propose+impl, Modal ergonomics,
Name-input removal, cli-arg injection fix).

## ✅ Worked

- **Normalizer approach kept the ~30-file rewrite non-breaking.** Every
  legacy shape (scalar `role`, `initialInput`, bare `runtime + prompt`)
  gets folded into the new `mode + roles + prompts` schema at load
  time with a warning. Existing `agents.yaml` files continue to work
  unchanged. Verified with the live project's own config.
- **`roles[]` as multi-value cleans up the "3 agents for 1 CLI"
  problem.** Users can now declare one `claude` worker with
  `roles: [code, review, verify]` instead of three near-duplicate
  entries. Dispatch matches via `roles.includes(request.role)` and
  the job records the specific dispatched role.
- **Modal reshape (chip multi-select + per-role prompt textareas)
  made the UI directly reflect the schema.** No more mystery `shape`
  toggle that only differed in which fields were visible.
- **Manager singleton + mode-gate enforcement stayed clean.** The
  Manager Modal variant hides all the fields that are structurally
  fixed for `manager` (Roles / Mode / Runtime / Specialties /
  Concurrency / Dedicated), so the form fits ergonomically.
- **`.ithyno/` scoping via `.gitignore`** landed adjacent (via the
  session-var follow-up) — session state is local, not shared.

## ⚠️ Surprises

- **The `initialInput`-visible-in-Runtime-backed bug that seeded this
  proposal turned out to be a symptom, not the disease.** The real
  problem was that `shape` had never mapped to observable behavior —
  the Modal was toggling between "which fields render" while the
  runner branched on the same axis. Once `mode` became the real
  behavioral fork, most of the special-case Modal code just
  disappeared.
- **cli-arg prompt injection regression.** During the reshape,
  command-only agents whose args did not contain `-p` AND had
  explicit `prompts.<role>` set were spawning without the prompt
  reaching the CLI. The pre-reshape runner unshifted `-p
  <initialInput>` in that case; the new resolve()'s
  `userAuthoredArgs` gate accidentally dropped the whole injection
  path. Surfaced only when the user's live config was tested
  end-to-end. Fixed with a two-part gate: (a) inject when args
  doesn't already contain the promptFlag, AND (b) either
  `prompts.<role>` is set explicitly (agent or runtime) or the
  agent is runtime-referenced.
- **Iterative UX passes were spec-level changes we added mid-flight.**
  Manager Modal slim, Advanced disclosure, scroll behavior, Name
  input removal — all landed after the initial spec was VALID. Each
  time we retrofit the spec delta before commit per the CLAUDE.md
  hard rule.
- **`role: coder` legacy alias.** The pre-existing loader defaulted to
  `role: "coder"` when unset; the reshape canonicalizes to `code`.
  The normalizer maps `coder → code` transparently so the user's
  live config kept working.

## 🔁 Differently

- **Should have distinguished "explicit" vs "built-in" prompts from
  the first draft of the resolve() rewrite.** The `userAuthoredArgs`
  boolean was too blunt — it lumped "user hand-authored args
  including prompt" together with "user set prompts explicitly and
  expects runner delivery." Separating those two upstream would
  have avoided the injection regression.
- **Should have written the prompt-injection rules into the spec
  before implementing.** The spec initially only described the
  `mode` branch and the 3-tier resolution; it left the cli-arg
  injection semantic implicit. The fix commit had to retrofit an
  explicit "Prompt injection into args (cli-arg mode)" clause with
  4 scenarios into the reshape delta.
- **The Modal ergonomics work should have been a separate change.**
  Bundling Manager slim / Advanced disclosure / scroll / Name
  removal into the reshape delta made the review surface larger
  than the "core reshape" strictly needed. In hindsight a
  `refine-agents-config-modal-post-reshape` change would have been
  cleaner.

## 🌱 Follow-ups

- **`add-modal-command-picker-and-presets` reshape.** That proposal
  was written against the pre-reshape Legacy shape. Rework so
  presets populate `command`, `args`, and `prompts.<role>` on the
  new schema; preset button becomes a "prefill from CLI" affordance.
- **Multi-role dispatch UI verify (9.10 from tasks.md).** Needs a
  real dispatch against a multi-role agent to confirm the jobs list
  renders the dispatched role (not the agent's whole `roles`
  array). Deferred — code paths are unit-tested in
  `registry-reshape.test.ts`.
- **Modal round-trip verify (9.11).** Opening an old-shape agent in
  the Modal should show the normalized state populated in the new
  fields; saving should write the new shape and drop the old
  fields. User confirmed the live config was migrated to the new
  shape after their Modal edits, so this is de-facto verified but
  no dedicated screenshot was captured.
- **UI-level "warnings" surface.** The loader now returns a
  `warnings: string[]` list of normalization notices via
  `publicConfig()`. The dashboard doesn't render it yet — a
  yellow-banner refine change would let users see when their
  `agents.yaml` is running on the deprecated-shape compat path.
- **`docs/ideas/2026-07-13-agent-roles-user-manual-entry.md` update.**
  That idea documented the role vocabulary pre-reshape; needs a
  note about `roles[]` multi-select and the new prompt-resolution
  chain.
