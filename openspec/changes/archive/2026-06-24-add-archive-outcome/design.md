## Context

The OpenSpec archive process moves a completed change directory to
`openspec/changes/archive/<YYYY-MM-DD>-<id>/`. The directory carries every
artifact that captured the original *plan*: proposal, design, specs, tasks. It
carries nothing about the *experience* of shipping the plan. Three feedback
channels were sketched in
[feedback-channels](../../../docs/ideas/2026-06-23-feedback-channels.md);
this change implements channel B (Archive Outcome). Channels A
(`add-code-docs`) and the synthesis layer remain future work.

## Goals / Non-Goals

**Goals:**
- An `outcome.md` artifact convention that lives next to the existing archive
  files.
- A light template (4 sections, free-form) so writers know where to start
  without being boxed in.
- Dashboard surfaces `outcome.md` on the Archived panel for any archive entry
  that has one.
- Backfill outcomes for the recently-archived changes whose context is fresh.
- Workflow / skill update so future archives consistently produce outcomes.

**Non-Goals:**
- Forcing the outcome structure with a schema or validator. Outcomes vary a
  lot; a strict schema would discourage writing them at all.
- Auto-generating outcomes from code/comments. Outcomes are reflection; only
  humans (or a turn-end AI summary) can write them honestly.
- Cross-cutting tags on outcomes — that belongs to `add-cross-cutting-tags`
  (already sketched as the next change). Outcomes will naturally adopt
  `tags:` frontmatter once that change lands.
- Editing outcomes from the UI. The dashboard is read-only for outcomes.

## Decisions

- **File: `outcome.md` in the archive directory.** Same level as proposal /
  design / tasks. Discoverable, fits the existing archive convention, no
  config required.
- **Template, not schema.** The skill carries a Markdown template with the
  4 sections (`## ✅ What worked`, `## ⚠️ What surprised us`,
  `## 🔁 What we'd do differently`, `## 🌱 Follow-ups`). The parser does not
  enforce them — it returns the body as-is for rendering. Missing sections
  are fine.
- **Body in the archive summary.** `ChangeSummary` gets
  `outcome: { body: string } | null`. Bodies are small and we already eagerly
  scan archive directories; carrying the body avoids a second round-trip
  when rendering the archived panel.
- **Markdown rendering on the archived panel.** Reuse the `react-markdown`
  setup landed by `add-design-docs` so the visual treatment matches the
  Docs page.
- **Overview indicator.** A subtle `✓ outcome` text after the date/progress
  line in the Archive list. Click-through is the change link itself (already
  exists).
- **Backfill scope.** Six outcomes for changes archived (or soon-to-be
  archived) during this session: `add-ui-orchestration`,
  `add-archived-change-fallback`, `persist-terminal-session`,
  `add-embedded-terminal`, `add-cli-command-mode`, `add-design-docs`. The
  last three are pending archive but their context is fresh, so we write the
  outcomes now and they land alongside the archive on the next archive run.
- **Skill update.** The "Archive" step of the OpenSpec workflow becomes
  "write outcome → archive". The template lives inline in the SKILL.md so
  it's the first thing the agent sees.

## Risks / Trade-offs

- **Outcome quality drift.** Without enforcement, outcomes can become
  perfunctory. Mitigation: the template gives meaningful prompts, and the
  dashboard surfaces them prominently enough that lazy outcomes feel
  obviously thin.
- **Backfill takes effort.** Six retroactive outcomes is real writing.
  Mitigation: they are small, and the session memory is what makes them
  high quality; deferring would lose that.
- **No tags yet.** Outcomes will not be tag-queryable until
  `add-cross-cutting-tags` lands. Acceptable — tags are explicitly a
  follow-up and outcomes are useful on their own page.
- **Template inflation.** Future revisions may want more sections (perf
  numbers, security notes). Add them in the SKILL.md as the project
  evolves; no code change required.
