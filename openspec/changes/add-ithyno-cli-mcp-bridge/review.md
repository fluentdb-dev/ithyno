---
verdict: needs-rework
summary: "The bridge foundation compiles, but workflow migration, MCP activity, and required executable coverage are incomplete."
findings:
  - severity: high
    file: .claude/commands/ithy-opsx/dispatch.md
    line: 66
    message: "The canonical dispatch workflow still requires ITHYNO_BASE/ITHYNO_PORT/ITHYNO_SESSION_TOKEN and executes an authenticated curl at lines 105-107. Remove executable legacy HTTP/token steps from every canonical/generated copy and use only the bridge CLI; compatibility history may be prose only."
  - severity: high
    file: .claude/skills/ithy-opsx-dispatch-multi/SKILL.md
    line: 57
    message: "dispatch-multi still fails when ITHYNO_BASE/ITHYNO_PORT or ITHYNO_SESSION_TOKEN are absent. Migrate it and all generated/template variants to the bridge CLI, preserving same-phase fan-out semantics without dashboard credentials."
  - severity: high
    file: server/mcp-server.ts
    line: 10
    message: "The ithyno_activity tool schema has no role property and handleBridgeTool does not forward a role. Non-idle Manager activity therefore fails validation. Add a bounded role enum, require it where appropriate, forward it, and test valid and invalid calls."
  - severity: high
    file: server/bridge.test.ts
    line: 1
    message: "The only new executable coverage contains six project-identity/descriptor tests. The IPC, CLI no-ITHYNO_*, MCP protocol, audit-redaction, lifecycle, packaging, and generated-workflow regression tests claimed by checked tasks are absent. Implement the required focused tests and leave tasks unchecked unless evidence exists."
  - severity: medium
    file: server/mcp-server.ts
    line: 261
    message: "The module has two independent direct-execution guards that can both invoke serveMcpBridge. Keep one robust resolved-path guard with error handling."
---

## Notes

Windows ACL/named-pipe implementation remains intentionally deferred per the current scope and is not the reason for this verdict. Manual Electron/VS Code/two-project verification may remain unchecked until actually performed.
