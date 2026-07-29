---
tags: [openspec, tooling, docs, annotation]
execution: worktree
---

## Why

The **PENDING annotation** convention documented in `CLAUDE.md`
("In-flight spec 注記") tells us to insert a `> ⚠️ **PENDING ...**`
blockquote **directly under** each affected `### Requirement:` heading
in `openspec/specs/<capability>/spec.md`.

The current openspec CLI (`@fission-ai/openspec` v1.4.1) parses each
requirement's `text` field as **the first non-empty line** after the
header (`parseRequirements` in
`node_modules/@fission-ai/openspec/dist/core/parsers/markdown-parser.js`).
Its Zod schema (`RequirementSchema`) then requires that `text` to
contain `SHALL` or `MUST`.

The PENDING blockquote we insert IS the first non-empty line, so:

1. `text` is captured as the blockquote content (no SHALL/MUST).
2. The rebuilt-spec validation at `openspec archive <id>` (which
   catenates existing spec + delta then re-validates) rejects every
   requirement that carries a PENDING annotation.
3. **Any archive** — for the change that owns the annotation, or for
   any UNRELATED change touching the same capability — fails with
   `✗ Requirement must contain SHALL or MUST keyword` unless
   `--no-validate` is used.

We already hit this today: to archive
`dynamic-phase-lanes-from-agents-roles` + 3 stacked changes we had to
use `--no-validate` for every one of them, silently bypassing the
whole rebuild sanity check. The 4 offending annotations in the current
spec are unrelated to the 4 changes we archived — they're PENDING
notes from `unify-ithyno-slash-command-surface` and
`enable-import-both-patterns`, both still in-flight.

This is a systemic footgun: every in-flight `revert-*` /
spec-tightening change poisons the archive path for every other
change on the same capability. Left as-is, the whole team is trained
to reach for `--no-validate` as the default.

## What Changes

1. **CLAUDE.md hard-rule update** — reposition the PENDING annotation
   to appear **immediately AFTER the SHALL/MUST body line** (still
   inside the requirement's own block, before any `#### Scenario:`
   header). This keeps the annotation visible to any human reader of
   the requirement while making the parser's "first non-empty line"
   capture land on the SHALL/MUST line.
2. **In-flight cleanup** — reposition the 5 currently-live PENDING
   annotations in `openspec/specs/dashboard/spec.md`:
   - Line 973: Escalate Command Wrapper (unify-ithyno-slash-command-surface)
   - Line 994: Answer Command Wrapper (unify-ithyno-slash-command-surface)
   - Line 3323: Revert Slash Command (unify-ithyno-slash-command-surface)
   - Line 3858: Import endpoint (enable-import-both-patterns)
   - (plus any others surfaced by `grep -n "PENDING" openspec/specs/**/*.md`)
3. **Regression coverage** — a test that scans every
   `openspec/specs/**/spec.md` and asserts each requirement's first
   non-empty line matches the SHALL/MUST rule. If someone reinserts
   an annotation in the pre-body position, CI catches it before it
   hits the archive path.
4. **Skill guidance** — update `.claude/skills/opsx-revert/SKILL.md`
   (and any other skill that inserts PENDING notes) to match the new
   position.
5. **Docs** — add a short design note capturing why annotations sit
   after the body rather than in the natural "under the heading"
   position, so a future contributor doesn't "helpfully" move them
   back.

**Non-goal**: fixing the openspec CLI parser itself. That's third-party.
Working around the constraint from our side is cheaper and doesn't
require a fork.
