## 1. Server: parse outcome.md
- [x] 1.1 Extend `ChangeSummary` with `outcome: { body: string } | null` in server/model.ts
- [x] 1.2 Read `outcome.md` from each archive directory during scan
- [x] 1.3 Mirror the type extension in web/src/types.ts

## 2. UI: archived panel renders outcome
- [x] 2.1 ChangeDetail's archived panel: render outcome body below the summary
- [x] 2.2 Use react-markdown (already wired by add-design-docs) for rendering

## 3. UI: Overview archive list indicator
- [x] 3.1 Show `✓ outcome` after the date/progress on entries that have one
- [x] 3.2 No indicator when outcome is null

## 4. Workflow / skill update
- [x] 4.1 Add an "Outcome" subsection under Archive in `.claude/skills/openspec-flow/SKILL.md`
- [x] 4.2 Include the 4-section template (✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups)
- [x] 4.3 Update CLAUDE.md "Standard order": write `outcome.md` before archive

## 5. Backfill (write outcomes for recent / pending archives)
- [x] 5.1 Write outcome.md for `add-ui-orchestration`
- [x] 5.2 Write outcome.md for `add-archived-change-fallback`
- [x] 5.3 Write outcome.md for `persist-terminal-session`
- [x] 5.4 Write outcome.md for `add-embedded-terminal` (lands on archive)
- [x] 5.5 Write outcome.md for `add-cli-command-mode` (lands on archive)
- [x] 5.6 Write outcome.md for `add-design-docs` (lands on archive)

## 6. Verification
- [x] 6.1 Navigate to an archived change with outcome — outcome renders below the panel
- [x] 6.2 Overview Archive list shows `✓ outcome` only on entries that have one
- [x] 6.3 An archive entry without outcome.md still renders cleanly
