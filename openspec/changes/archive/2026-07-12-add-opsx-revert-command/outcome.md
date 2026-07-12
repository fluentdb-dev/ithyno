# Outcome: add-opsx-revert-command

## ✅ Worked

- **`/opsx:revert <scope>` command landed as spec + skill + command
  entry, following the same 3-file shape** as `add-worker-skills`
  and `add-manager-loop-skill`. Nothing new to learn about wiring —
  the pattern generalizes.
- **The recipe is a linear checklist** of the manual work
  `revert-kanban-ui-lanes` did — no branching, no state machine, no
  optional steps. That was deliberate: the value of the tool is
  eliminating "did I remember to annotate?", and a scripted
  checklist is easier to enforce than a decision tree.
- **The skill explicitly refuses to `git commit`, `openspec archive`,
  or touch git.** The revert change goes through the standard
  `/opsx:apply` → `/ithy-opsx:archive` flow. This keeps blast radius
  small — the command CAN'T accidentally advance a broken change.
- **Case β (in-flight target) handling is baked in** via a distinct
  "reverted-target archive procedure" step. That matches what
  `openspec-flow/SKILL.md` already documents, so future in-flight
  reverts (rare but real) don't need the operator to remember the
  target-archive step.

## ⚠️ Surprises

- **The Spec delta was harder to write than the impl.** Deciding
  what SHALL / SHALL NOT actually belongs in the requirement — vs.
  what's just "the recipe" — took real thought. Ended up cutting
  everything that could drift with a future skill revision (exact
  prompt wording, exact order of `AskUserQuestion` panes) and
  keeping only the *contract* (what files exist after, what
  annotations were inserted, what validate says).
- **The skill is long (~300 lines).** Longer than
  `ithy-opsx-archive`, longer than `ithy-opsx-apply`. Justified —
  the workflow really does have that many steps — but it means the
  next `/opsx:revert` invocation eats some tokens per step. Worth
  it against the hand-typed alternative that misses annotations.

## 🔁 Differently

- **Considered auto-detecting reverts from proposal keywords**
  ("revert", "undo", "roll back"). Skipped — too heuristic, too
  easy to false-fire on unrelated work. The user invoking the
  command is the trigger, not automatic detection.
- **Considered a `--dry-run` mode** that shows the annotations
  without inserting them. Skipped — the resulting change is
  already a preview (nothing's committed), and the annotations
  are trivially inspectable + reversible with git.

## 🌱 Follow-ups

- **`/opsx:revert` doesn't handle multi-capability reverts as a
  single command yet.** If the target spans `dashboard` + `agent-runner`,
  the skill would need to loop capabilities. Current wording covers it
  ("For every capability that owns at least one targeted requirement...")
  but there's no worked example. First real multi-capability revert will
  exercise it.
- **CLI integration**: the OpenSpec CLI itself could grow a
  `openspec new revert <scope> --target <req>` subcommand that generates
  the scaffold in one shot, without going through Claude. Out of scope
  here — this change bought us "the checklist is enforced" and a proper
  CLI extension is a separate, larger piece of work.
- **A test of the skill against a real revert.** The manual dry-read
  against `revert-kanban-ui-lanes` covers the paths, but the first
  actual `/opsx:revert` invocation will surface real-world edge cases
  (unusual requirement names, mixed Case α/β, missing origins).
