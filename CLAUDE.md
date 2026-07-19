# Project rules for Claude

This repository is developed with **OpenSpec**, a spec-driven workflow. Follow
the project skill `.claude/skills/openspec-flow/SKILL.md` whenever the user
requests work.

## Hard rule

**Before implementing any spec-level change, propose first.**

A change is spec-level when it adds a capability, changes observable behavior,
or alters a contract. Trivial fixes (bugs, refactors, typos, comments,
tests-for-existing-behavior) skip the proposal.

When uncertain, ask once: "is this spec-level (proposal needed) or trivial?"

## Standard order

1. `/opsx:propose "<description>"` in the embedded terminal — or
   `npm run openspec -- new change <id>` + hand-write the artifacts.
2. `npm run openspec -- validate <id>` until VALID.
3. Implement, ticking tasks in `tasks.md` as you go.
4. `npm test && npm run typecheck && npm run build` before claiming done.
5. Write `openspec/changes/<id>/outcome.md` capturing what was learned (4
   suggested sections: ✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups).
   See `.claude/skills/openspec-flow/SKILL.md` for the template.
6. `npm run openspec -- archive <id>` (or `/opsx:archive <id>` in the terminal).

If implementation happened ahead of a proposal, retrofit the change after the
fact (see "Retrofit" in the skill). Do not let spec-level work go unrecorded.

For reverting a past change, follow the **Revert** section of
`.claude/skills/openspec-flow/SKILL.md` — it defines the `revert-<scope>`
naming convention, Case α (archived target → MODIFIED/REMOVED delta) vs
Case β (in-flight target → ADDED delta + reverted-target archive)
classification, and the reverted-target archive procedure.

## In-flight spec 注記 (Hard rule)

When you propose a change with **MODIFIED** or **REMOVED** deltas against
an already-landed requirement, immediately add a `PENDING` annotation to
that requirement in the current `openspec/specs/<capability>/spec.md`.

Why: between propose and archive, the spec still shows the requirement as
authoritative. Another agent (or a future session) reading the spec will
follow the doomed requirement without knowing a revert / rewrite is in
flight. The annotation closes that gap; `openspec archive` rewrites or
removes the requirement anyway, so the annotation disappears automatically.

Format (insert directly under the `### Requirement:` heading):

```md
### Requirement: <name>

> ⚠️ **PENDING <ADDED|MODIFIED|REMOVED>** by [<change-id>](../../changes/<change-id>/): <一行理由>.

<existing requirement body>
```

Applies to `revert-*`, spec-tightening, and any propose that shifts an
existing contract. Not needed for pure ADDED (the requirement doesn't
exist yet in the spec).

## Idea capture (stage ①)

When a design conversation produces a conclusion worth keeping but NOT yet a
formal change proposal, save it as `docs/ideas/YYYY-MM-DD-<kebab-topic>.md`
before ending the turn. Use the frontmatter format defined in
`.claude/skills/openspec-flow/SKILL.md` ("Idea capture"). Ideas are never
deleted — when they graduate to a doc or change, update the frontmatter to
`status: promoted` and link to the destination via `promoted_to`.

## What lives where

- `docs/ideas/` — stage ① idea-stage captures (never deleted; promoted via frontmatter).
- `docs/` — stage ② settled-direction docs (architecture, roadmap, ADRs).
- `openspec/specs/<capability>/spec.md` — current behavior of the system.
- `openspec/changes/<id>/` — an in-flight proposal with proposal/design/specs/tasks.
- `openspec/changes/archive/<date>-<id>/` — completed changes (history).
- `examples/sample-project/openspec/` — fixture data for manual testing of the
  dashboard. Do not mix this with the real project specs.

## Useful commands

```bash
npm run dev                          # API 4321 + Vite 5173
npm start                            # production build, single-process
npm test                             # vitest
npm run typecheck                    # tsc --noEmit
npm run openspec -- list             # active changes
npm run openspec -- validate --all   # validate everything
```
