# Outcome — clarify-agmsg-dispatch-semantics

Spec-only cleanup. `Agent Mode Field` worker `live-shell`
definition is rewritten from the pre-agmsg placeholder ("stdio:
[pipe, pipe, pipe] + aider-style stdin") to the actual post-agmsg
routing rules. `Dispatch Slash Command` gains a normative
statement that Copilot workers can only iterate via fresh
`/agmsg spawn` (no Monitor tool = no send-based iteration), with
an informative note that Claude workers may optionally reuse
existing sessions.

## ✅ Worked

- **Two MODIFIED requirements in one change.** `Agent Mode Field`
  and `Dispatch Slash Command` are naturally connected: mode
  values dictate dispatch routing, and dispatch routing dictates
  iteration semantics. Landing the clarification as one propose
  keeps the two aligned.
- **Retired the aider placeholder without leaving footnotes.**
  The old scenario ("worker mode live-shell spawns headless with
  stdin piped") is dropped entirely, not just annotated as
  historical. The runner never had that code path — the scenario
  was purely aspirational — so removing it costs nothing.
- **Copilot's Monitor limitation is now first-class in the spec.**
  Anyone writing a new agmsg-adjacent skill can look at
  `Dispatch Slash Command` and see "copilot → fresh spawn per
  iteration" as a requirement, not folklore.

## ⚠️ Surprises

- **Two PENDING annotations, one archive.** Both requirements
  will apply their MODIFIED deltas on `openspec archive`. Since
  archives are atomic per-change, both annotations dissolve at
  the same time.

## 🔁 Differently next time

- **Retire placeholder text in the same change that lands its
  replacement.** The aider-stdin scenario has been dead code
  since P2b/c but survived multiple archives because no one
  called it out. Adding to the P2b/c retrospective: "check for
  paragraphs that describe the OLD world but weren't touched by
  this change."

## 🌱 Follow-ups

- **`send`-based Claude iteration as an actual optimization.**
  The Claude scenario is informative today ("MAY reuse"). A
  concrete change could pick one option (fresh vs reuse) as the
  normative default and encode it, with the other option opt-in
  via agents.yaml or an env var.
- **When a new agmsg-type lands** (say `hermes` or another
  Monitor-less CLI), update `Dispatch Slash Command`'s Copilot
  scenario to include it. Better: refactor the constraint from
  "copilot" to "any agmsg-type whose manifest lacks Monitor
  support" so the spec doesn't need per-type edits.
- **Live-shell no-agmsg fallthrough scenario in `Agent Mode Field`
  refers to the dispatcher's fallthrough** but the
  runner-code-level story is different (runner used to
  stdio-pipe). Reconcile the runner code with the new spec text
  when the runner gets touched next; today the runner is
  effectively unused for worker `live-shell` (dispatcher owns
  everything).
