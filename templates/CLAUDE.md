# Project rules for Claude

This repository is developed with **OpenSpec**, a spec-driven workflow, and is
viewed through the **OpenSpec UI** dashboard. Follow the project skill
`.claude/skills/openspec-flow/SKILL.md` whenever the user requests work.

## Hard rule

**Before implementing any spec-level change, propose first.**

A change is spec-level when it adds a capability, changes observable behavior,
or alters a contract. Trivial fixes (bugs, refactors, typos, comments,
tests-for-existing-behavior) skip the proposal.

When uncertain, ask once: "is this spec-level (proposal needed) or trivial?"

## Standard order

1. `/opsx:propose "<description>"` in the embedded terminal — or
   `npx openspec new change <id>` + hand-write the artifacts.
2. `npx openspec validate <id>` until VALID.
3. Implement, ticking tasks in `tasks.md` as you go.
4. Run this project's verification commands before claiming done.
   <!-- Replace the line below with your actual checks, e.g. `pytest && mypy`,
        `cargo test && cargo clippy`, `go test ./... && go vet ./...`. -->
   ```
   # Replace with your project's verification commands
   ```
5. Write `openspec/changes/<id>/outcome.md` capturing what was learned (4
   suggested sections: ✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups).
   See `.claude/skills/openspec-flow/SKILL.md` for the template.
6. `npx openspec archive <id>` (or `/opsx:archive <id>` in the terminal).

If implementation happened ahead of a proposal, retrofit the change after the
fact (see "Retrofit" in the skill). Do not let spec-level work go unrecorded.

For reverting a past change, follow the **Revert** section of
`.claude/skills/openspec-flow/SKILL.md` — it defines the `revert-<scope>`
naming convention, Case α (archived target → MODIFIED/REMOVED delta) vs
Case β (in-flight target → ADDED delta + reverted-target archive)
classification, and the reverted-target archive procedure.

## Idea capture (stage ①)

When a design conversation produces a conclusion worth keeping but NOT yet a
formal change proposal, save it as `docs/ideas/YYYY-MM-DD-<kebab-topic>.md`
before ending the turn. Use the frontmatter format defined in
`.claude/skills/openspec-flow/SKILL.md` ("Idea capture"). Ideas are never
deleted — when they graduate to a doc or change, update the frontmatter to
`status: promoted` and link to the destination via `promoted_to`.

## What lives where

- `docs/ideas/` — stage ① idea-stage captures (never deleted; promoted via frontmatter).
- `docs/` — stage ② settled-direction docs (architecture, ADRs, guides).
- `openspec/specs/<capability>/spec.md` — current behavior of the system.
- `openspec/changes/<id>/` — an in-flight proposal with proposal/design/specs/tasks.
- `openspec/changes/archive/<date>-<id>/` — completed changes (history).

## OpenSpec commands

```bash
npx openspec list              # active changes
npx openspec validate --all    # validate every change + spec
npx openspec new change <id>   # scaffold a change
npx openspec archive <id>      # move a completed change to archive
```
