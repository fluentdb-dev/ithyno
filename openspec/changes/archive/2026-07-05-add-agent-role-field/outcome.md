# Outcome — add-agent-role-field

## ✅ Worked

- The proposal's "keep it inert" scope held. Load-and-default was
  the only path touched; nothing in the runner references the new
  fields yet. Downstream phases inherit a settled data shape.
- Applying defaults in `validateAgents()` (not in a separate
  post-load pass) followed the existing pattern for `args`
  (`Array.isArray(o.args) ? o.args.map(String) : []`). The type
  after load is fully concrete — no `undefined` handling downstream.
- New `server/agents/registry.test.ts` uses `mkdtempSync` + a real
  `agents.yaml` file so the loader's parse path is actually
  exercised, not stubbed. 11 cases including error-message wording
  assertions.
- Template documentation in `templates/agents.yaml.example` lands
  as a commented block under the shipped agent entry — the only
  discovery surface for the new fields until a later phase adds
  UI.

## ⚠️ Surprises

- **`AgentDef` becoming stricter broke `registry-initial-input.test.ts`.**
  I had claimed in the proposal that the existing file would stay
  untouched; making `role` / `specialties` / `concurrency`
  non-optional at the type level forced 3 literal updates there.
  Bookkeeping, not a scope change, but noting it as
  proposal-vs-reality slip. Alternative would have been to keep the
  fields optional on the type and default at read time, but the
  concrete-after-load pattern already matches `args` and is easier
  to reason about downstream.
- Vitest picked up the new test file automatically (no
  `vitest.config.ts` change needed — the include glob covers
  `server/**/*.test.ts`). Good, but worth stating so future
  contributors don't hunt for a registration step.

## 🔁 Differently

- Nothing on the code side.
- Proposal wording lesson: when adding a required field to an
  exported type, assume every construction site (tests, mocks,
  fixtures) needs an update. State that in Impact instead of
  hand-waving "unchanged."

## 🌱 Follow-ups

- **`add-worktree-pool`** — the next Phase 1 change. Adds
  `dedicated?: boolean` to `AgentDef`; MUST be built on top of the
  merged `add-agent-role-field` result (they touch the same
  `AgentDef` type + `templates/agents.yaml.example`). Sequencing
  note in both proposals already flags this.
- **Consumer of these fields (later phases)**: dispatcher will
  read `role` for phase-to-role routing; specialty matching per
  the tag taxonomy (`area/*` participates); `concurrency`
  becomes an in-agent semaphore. `add-agent-knowledge-file`
  layers `knowledgeFile` on top, coder-only.
- **Runtime check for schema evolution**: if a user upgrades and
  their previously-VALID `agents.yaml` starts throwing
  concurrency-must-be-integer for some yaml quirk (e.g. YAML
  loads `1e0` as float `1`), we should keep an eye on it. Not
  worth pre-empting; surface if it happens.
