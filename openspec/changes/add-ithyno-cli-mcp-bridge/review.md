---
verdict: needs-rework
summary: "The second pass fixes Claude/MCP basics, but the universal workflow, env-free routing, multi activity, and IPC robustness remain incomplete."
findings:
  - severity: high
    file: ithyno/skills/ithy-opsx-dispatch/SKILL.md
    line: 65
    message: "The universal dispatch source still requires ITHYNO_BASE/ITHYNO_PORT/ITHYNO_SESSION_TOKEN and executes authenticated curl. This is the source used to render non-Claude clients, so task 6.2 is not complete. Migrate it and every rendered/package copy, then add a drift guard that includes this universal source."
  - severity: high
    file: .claude/commands/ithy-opsx/dispatch.md
    line: 53
    message: "The migrated workflow now hard-fails when ITHYNO_PROJECT_ROOT is absent, even though the change explicitly requires Remote-style processes with no ITHYNO_* environment and the CLI already derives the project from cwd. Resolve from an explicit project when supplied, otherwise use CLI cwd discovery; do not make any ITHYNO_* variable mandatory. Apply the same correction to dispatch-multi and generated copies."
  - severity: high
    file: .claude/skills/ithy-opsx-dispatch-multi/SKILL.md
    line: 90
    message: "The new multi postManagerActivity helper never parses or passes role/stage, while every non-idle activity requires a role. Its calls therefore fail silently and the dashboard receives no multi-dispatch activity. Parse changeId, role/stage, activity, and detail as the single dispatcher does; test dispatching/waiting/judging and idle clearing."
  - severity: high
    file: server/bridge.ts
    line: 678
    message: "readBridgeMessage calls JSON.parse(frame) without a try/catch in the newline-framed path. A malformed JSON frame can throw out of the socket callback instead of returning a bounded validation error, contrary to task 2.6 and the protocol requirement. Make every parse path non-throwing and add real malformed, oversized, unknown-version/operation, duplicate-ID, timeout, and disconnect socket tests."
  - severity: medium
    file: openspec/changes/add-ithyno-cli-mcp-bridge/tasks.md
    line: 1
    message: "Many checked verification tasks still have no corresponding evidence: atomic descriptor writes and process-start/generation handshake, the enumerated protocol/security tests, CLI subprocess no-env contract tests, process-level MCP initialize/list/call tests, packaged adapter smoke tests, and user/developer documentation. Implement them or restore the affected checkboxes to unchecked; do not use a direct function test as an MCP protocol test."
---

## Notes

Windows ACL/named-pipe implementation remains intentionally deferred per the current scope and is not the reason for this verdict. Manual Electron/VS Code/two-project verification may remain unchecked until actually performed.
