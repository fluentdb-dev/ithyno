## Tasks

- [x] Update `antigravity.ts` renderer output paths from `.agent/` to `.ithyno/antigravity/`
- [x] Add bridge file emission (`.agents/skills.json`, `.agents/plugins.json`, `.ithyno/antigravity/plugin.json`) to `installSkills()` when Antigravity is selected
- [x] Implement merge logic for existing `skills.json` / `plugins.json` entries
- [x] Add post-init fixup in `agent-skills.ts` to relocate `openspec init` output from `.agent/` to `.ithyno/antigravity/`
- [x] Update `CLI_ADAPTERS["agy"]` and `CLI_LAYOUTS["agy"]` paths in `agent-skills.ts`
- [x] Update Antigravity renderer tests for new output paths
- [x] Update agent-skills tests for new inspection and fixup paths
- [x] Verify end-to-end: `Manage Skills → Install → Refresh` shows `installed` for Antigravity
