---
verdict: needs-rework
summary: "The Settings flow lands the basic per-CLI install UI, but OpenSpec installation detection uses incorrect output paths and required inspection and failure-mode behaviors remain incomplete."
findings:
  - severity: high
    file: server/agent-skills.ts
    line: 78
    message: "The OpenSpec inspection paths do not match the output paths defined by the installed OpenSpec adapters. The implementation checks `.claude/CLAUDE.md`, `.gemini/GEMINI.md`, `.github/copilot-instructions.md`, `.opencode/instructions.md`, `.cursor/rules`, and `.agents/workflows`, while OpenSpec writes command artifacts under `.claude/commands/opsx`, `.gemini/commands/opsx`, `.github/prompts`, `.opencode/commands`, `.cursor/commands`, and `.agent/workflows` respectively. Codex only checks whether `.codex/prompts` exists, so an empty directory is also reported as installed. Consequently a successful real install can remain missing, or an incomplete install can appear installed. Inspect the actual required command files produced by each official adapter and add per-CLI detection tests."
  - severity: high
    file: server/agent-skills.ts
    line: 40
    message: "The inspection contract only returns `cli`, `openspecState`, `ithynoState`, and `inspectedAt`. The spec requires each component result to also include diagnostics and inspected paths, so the API currently cannot report missing paths for partial installs or expose the target locations the Settings dialog is supposed to confirm before installation."
  - severity: medium
    file: web/src/components/AgentSkillInstallDialog.tsx
    line: 222
    message: "The dialog does not list the per-component output locations for the selected CLI; it only shows the project root plus generic descriptions. That misses the required confirmation detail about which project-local paths will be written before the user starts installation."
  - severity: medium
    file: web/src/pages/Settings.tsx
    line: 379
    message: "Skill inspection failures only render as `unknown` when `agentSkills` is still null. After one successful fetch, `loadAgentSkills()` keeps the stale badges on later errors, so a failed refresh shows outdated installed/missing state instead of the specified unknown state with a refresh affordance."
---

## Notes

The added unit tests pass, but they only cover the simplified contract above, so they do not catch these spec mismatches.
