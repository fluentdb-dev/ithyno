<!-- SPDX-License-Identifier: MIT -->
# Project instructions for AGENTS.md-compatible assistants

This repository is developed with **OpenSpec**, a spec-driven workflow, and is
viewed through the **OpenSpec UI** dashboard.

## Hard rule

**Before implementing any spec-level change, propose first.**

A change is spec-level when it adds a capability, changes observable behavior,
or alters a contract. Trivial fixes (bugs, refactors, typos, comments, and
tests for existing behavior) skip the proposal.

## Standard order

1. Create an OpenSpec change: `npx openspec new change <id>`, then write its
   proposal, design, spec deltas, and tasks.
2. Run `npx openspec validate <id>` until it is valid.
3. Implement the tasks in order and tick each completed checkbox in
   `tasks.md`.
4. Run this project's verification commands before claiming completion.
5. Write `openspec/changes/<id>/outcome.md` with what worked, surprises,
   what to do differently, and follow-ups.
6. Archive with `npx openspec archive <id>`.

Do not ship a spec-level change without its OpenSpec record. If implementation
happened first, create and validate a truthful retrofit change before
archiving it.

## Project layout

- `openspec/specs/<capability>/spec.md` — current system behavior.
- `openspec/changes/<change-id>/` — in-flight proposal, design, task list,
  and spec deltas.
- `openspec/changes/archive/` — completed change history.
- `docs/ideas/` — design conclusions that are not yet formal proposals.

## Safe collaboration

- Read the relevant change artifacts before editing source files.
- Preserve user changes and do not overwrite existing files unless the task
  explicitly calls for it.
- Run the project's tests, type checks, and build steps that apply before
  declaring work complete.
