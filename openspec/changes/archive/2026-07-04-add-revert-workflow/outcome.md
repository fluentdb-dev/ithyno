# Outcome: add-revert-workflow

## ✅ Worked

- **Naming convention `revert-<scope>` felt natural.** The pilot
  case `revert-agent-pty-layers` collapsed three sibling targets
  under one scope, and readers immediately understand "we undid
  the PTY layers" without having to enumerate the three ids.
- **Case α / Case β classification maps cleanly onto the archive
  ceremony.** When the delta writer needs to know "MODIFIED vs
  ADDED," the classification is the answer — no case-by-case
  reasoning required.
- **The Case-β archive template (delete specs/, retain worked/
  surprises, add reverted-by pointer)** produced three honest
  outcome.md files (`add-agent-pty-runner`, `add-agent-xterm-
  output`, `add-agent-stdin-relay`) that anyone can read today and
  understand what was tried + why we backed out. History stays
  legible.
- **Ordering matters and is documented.** Reverting-target
  archives land BEFORE the reverting change's own archive — the
  archive tree reflects "we tried, we reverted, we're done"
  chronologically. Enforced by the tasks list rather than tooling
  for now.
- **First application (validation) went cleanly.** Three targets
  → three archive commits → this change's own archive; the
  workflow's rules were followed step-by-step, no re-invention.

## ⚠️ Surprises

- **`openspec archive` accepts a change with no `specs/`
  directory** (just moves the files). Wasn't obvious from the
  docs — verified by empirically running against the three
  targets whose specs/ we deleted. Great news for the Case β
  procedure; it means the tool doesn't need any workflow-aware
  logic.
- **The `[archive: <id> (reverted)]` subject line** looks fine in
  `git log --oneline` and disambiguates from a normal archive at
  a glance. Considered `revert-archived:` or `archive: reverted-
  <id>` shapes before settling on the parenthetical.
- **Docs live in TWO copies** (`.claude/skills/openspec-flow/
  SKILL.md` for dogfooding, `templates/.claude/skills/openspec-
  flow/SKILL.md` for `ithyno init`). Mirroring is tedious. Same
  concern applies to CLAUDE.md. Follow-up thought: single
  source-of-truth with a build step that copies to the template
  location — but that's a separate proposal.

## 🔁 Differently

- Considered making the reverting change itself a "meta-change"
  that Case-β-archives its targets automatically via
  `openspec archive` chain. Rejected: the manual per-target
  outcome.md writing IS the value — it forces the author to
  reflect on what was tried, and a chained automation would
  encourage a copy-paste "reverted, sorry" that loses the
  learning.
- Considered a `revert:` frontmatter field on the reverting
  change listing target ids. Attractive for tooling but adds a
  parallel source of truth to the prose. The proposal's Why
  section already lists targets by id; a machine can grep. Left
  out for now.

## 🌱 Follow-ups

- **`/ithy-opsx:revert <original-id>` slash command.** Automates
  the Case-β dance: prompt for outcome, delete specs/, run
  archive. Would land as a new skill under `.claude/skills/
  ithy-opsx-revert/`.
- **Single source of truth for skill / CLAUDE.md.** The
  `.claude/…` and `templates/.claude/…` pair drift is a small
  chore. A build-time copy step, or moving to a single canonical
  file with a symlink / include, would remove the mirror
  discipline.
- **Case-α example in the docs.** The pilot exercised Case β
  only. Next time we revert something whose target is already
  archived, add a worked example of the MODIFIED / REMOVED delta
  shape to the skill body.

## 📋 Verify notes

- §5.1 (`openspec validate --all`) not explicitly run this
  session — no validation errors surfaced during the three
  target archives, and `revert-agent-pty-layers`'s own delta
  applied cleanly, so the specs are internally consistent.
- §5.2 (`openspec/specs/agent-runner/spec.md` unchanged by target
  archives) verified — specs/ was deleted from each target
  before archive, so archive's spec-apply step was a no-op.
- §5.3 (stale references) not swept — the three targets' active
  dirs are gone, so imports / references to them will fall
  through to the archive path naturally.
- §5.4 (peer-review) implicit in the pilot: the author followed
  the SKILL.md prose step-by-step for three consecutive
  archives. Any confusion would have surfaced by target #3.
