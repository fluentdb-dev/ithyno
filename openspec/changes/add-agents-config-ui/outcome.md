# Outcome: add-agents-config-ui

## ✅ Worked

- **Row-level Edit / Delete + tab-level + Add button** — the shape
  the user picked in the pre-work `AskUserQuestion`. Zero new
  sections on the tab; the Agents tab stays 4 sections + toolbar-style
  + Add button below Configured (idle).
- **Legacy / runtime-backed shape toggle** in the modal — hides the
  fields of the non-active shape. Matches the actual `agents.yaml`
  schema (Phase 3.1's `AgentDef` supports both) without exposing
  the union to the user.
- **Discriminated `AgentConfigPayload`** — `{ action: "upsert" | "delete" }`.
  One helper (`saveAgentConfig`) handles both writes; Phase 5.3
  can dispatch on `action` server-side without a second endpoint.
- **404 handling with a friendly hint** — until 5.3 lands, the client
  translates `POST /api/agents/config → 404` into a toast that names
  Phase 5.3 explicitly. The user isn't left wondering why nothing
  happened.
- **kebab-case regex test isolated in `AgentConfigModal.test.ts`** —
  same regex the modal uses; 7 cases cover the edge cases (leading
  digit, hyphen ends, uppercase, punctuation, empty). Phase 5.3 will
  reuse the same regex server-side, so this test also acts as the
  contract anchor.

## ⚠️ Surprises

- **`AgentPublic` mirroring means the modal's initial state has 5 knobs
  to derive** — command, args, runtime, prompt, shape. `deriveInitialForm`
  handles it, but if the server ever adds a third shape (e.g., HTTP
  runner), the modal grows another branch. Worth revisiting at that
  point.
- **Field validation lives in the modal, not the type** — I considered a
  Zod schema shared with the server, but Phase 5.3 doesn't exist yet
  and adding a runtime dep here would front-load work that belongs in
  5.3. Kept validation inline; when 5.3 lands it can hoist the schema.
- **`pushToast` was already threaded through the store** — nice, no
  new store slice needed. Saved a task.

## 🔁 Differently

- **Considered React Hook Form** — skipped. The form has 10 fields and
  <100 LOC of state; adding a dep just to save some `setForm(...)`
  calls isn't worth the bundle bytes.
- **Considered making `+ Add agent` a floating action in the tab
  toolbar** — kept it inline below Configured (idle) instead, so it's
  colocated with the rows it edits. Matches the AgentRow / Row pattern
  the user picked.

## 🌱 Follow-ups

- **Phase 5.3 (`add-agents-config-write`)** — implement `POST
  /api/agents/config` with atomic YAML round-trip, schema validation,
  and CSRF + isLocal guards. The client is already wired to it.
- **Empty-`agents.yaml` bootstrap** — currently the Configured section
  shows an instruction to write `agents.yaml` by hand. Once 5.3 lands,
  the `+ Add agent` button could bootstrap the file itself.
- **Multi-runtime support** — the modal's runtime dropdown reads from
  `runtimes` state, which loads from `/api/agents/runtimes`. If the
  runtimes list is empty, the runtime-backed shape has no valid choice
  and the modal effectively forces legacy. Not a bug — the fallback UX
  is correct — but adding a hint ("no runtimes declared; edit
  `agents.yaml`'s `runtimes:` section by hand for now") would clarify.
