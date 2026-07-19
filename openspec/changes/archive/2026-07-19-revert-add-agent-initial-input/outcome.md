# Outcome — revert-add-agent-initial-input

## ✅ Worked

- **Third Case β retirement today; the pattern is now
  well-rehearsed.** Same flow as
  `revert-refine-agents-config-modal` and
  `revert-add-manager-agent-config`: delete the target's
  `specs/`, rewrite `outcome.md`, `openspec archive <target> --yes`,
  then archive the revert.
- **Mode-based delivery captured explicitly.** The new
  `initialInput Field Applies Per Agent Mode` requirement makes
  the current dispatch (live-shell → PTY keystroke, single-prompt
  → prompt in args) part of the authoritative spec. Previously the
  behavior was only visible in
  `server/agents/registry-initial-input.test.ts`.
- **No code changes.** `AgentRegistry.resolve()` continues to
  populate `initialInput` + `initialInputMode` per mode; PTY and
  runner code paths consume the resolved shape as-is.

## ⚠️ Surprises

- **`SHALL` in the requirement's first sentence, not just first
  paragraph.** Third revert in a row where the validator flagged
  "must contain SHALL or MUST" because the SHALL landed after a
  parenthetical or backtick-heavy noun phrase. The rule seems to
  be "SHALL must be inside the first `.` or so of body text."
  Something to add to the openspec-flow skill's writing tips.
- **`Initial Input Translation` (agent-runner line 131) still
  exists in current spec** and describes the older `-p` CLI arg
  translation. It's not fully accurate post-reshape but it's not
  fully wrong either — the runner's translation code path still
  fires for agents that reach it with a defined `initialInput`.
  Left out of this revert's scope; would need its own tightening
  change if precision matters.

## 🔁 Differently next time

- **Consolidate the two agent-runner "initialInput" requirements**
  (`Initial Input Translation` + the new `initialInput Field
  Applies Per Agent Mode`) into a single canonical statement.
  Deferred here to avoid touching a landed requirement in a Case
  β revert.

## 🌱 Follow-ups

- **Tighten `Initial Input Translation`** to match the current
  runner behavior (or remove it if it's fully covered by the new
  requirement).
- **Consider `add-agents-config-ui`** for the same treatment — it
  has similar drift and 6 obsolete tasks per `revert-add-agents-
  config-ui` would be the fourth Case β today.
