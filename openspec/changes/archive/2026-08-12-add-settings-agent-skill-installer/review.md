---
verdict: needs-rework
summary: "Codex OpenSpec detection now matches the real OpenSpec 1.8 layout, but focus recovery and the claimed Settings/dialog coverage remain incomplete."
findings:
  - severity: medium
    file: web/src/pages/Settings.tsx
    line: 44
    message: "Agent skill state is loaded only when Settings mounts or its explicit Refresh/install callbacks run. App focus/visibility recovery reloads workspace state but never calls `loadAgentSkills`, so an Electron window can continue showing an inspection result from before files were installed or changed. Refetch Agent skill state during authenticated focus/session recovery (without closing the active dialog), and cover the recovery behavior."
  - severity: medium
    file: web/src/pages/Settings.test.ts
    line: 236
    message: "Tasks 4.1 and 4.2 are checked, but the added tests do not render `Settings` or `AgentSkillInstallDialog`; they only exercise store fields and literal state arrays. There is no test for row buttons/badges, component-only requests, SSE success/partial results, Retry, or post-completion refresh. Add component-level interaction tests for the behaviors claimed by those completed tasks."
  - severity: low
    file: server/agent-skills.ts
    line: 271
    message: "When both Codex SKILL.md files exist but `.agents/skills/.openspec-target` is missing or has another value, inspection returns `partial` while diagnostics list only the two SKILL.md files as expected—even though both listed files exist. Include the required marker path/value in paths and diagnostics so post-install verification explains the actual mismatch."
---

## Notes

The previous cross-agent false positive is resolved. OpenSpec 1.8.0 generates
Codex skills under `.agents/skills` with `.openspec-target` set to `codex`, and
the new inspection requires that marker; Agy-only output no longer makes Codex
appear installed. Legacy genuine Codex prompts remain supported.

The user confirmed that a missing Agent CLI should make both skill components
unsupported and hide `Manage skills`. The proposal, design, dashboard delta,
and task wording were updated to make that behavior the documented contract.

Verification completed with `npm run typecheck`, the complete test suite (778
passed, 1 skipped, using a writable temporary npm cache), `npm run build`, and
strict OpenSpec validation.
