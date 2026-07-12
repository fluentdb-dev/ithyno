## 1. Registry — Manager selection

- [ ] 1.1 `server/agents/registry.ts`: `managerAgent(): AgentDef | null` returns the first `role: "manager"` entry, or null
- [ ] 1.2 `validateAgents`: reject a `role: manager` entry with runtime-backed shape (must be legacy — command + args); emit a descriptive error naming the entry

## 2. PTY startup consults registry

- [ ] 2.1 `server/sync/pty.ts::ptyStartupCommand(registry)`: return `{ cmd, args, initialInput? }` from priority chain (manager entry → env var → hardcoded default)
- [ ] 2.2 PTY spawn path: after the child starts, if `initialInput` is set, write `initialInput + "\n"` to stdin

## 3. Server wiring

- [ ] 3.1 `server/index.ts`: pass `agentRegistry` into the PTY WebSocket handler
- [ ] 3.2 On agents.yaml reload, existing PTY sessions keep their spawned child (no restart) — only new PTY openings pick up the change. Document in code comment.

## 4. agents.yaml.example

- [ ] 4.1 Add a commented-out `role: manager` entry showing `command: claude, args: [--continue], initialInput: /opsx:manage` alongside the existing worker examples

## 5. Docs

- [ ] 5.1 Mention Manager declaration in `docs/2026-07-06-phase-2-implementation-and-redesign.md` or a follow-up doc (short: "Manager is now declarable via role: manager")

## 6. Tests

- [ ] 6.1 `server/agents/registry.test.ts` extension: `managerAgent()` returns first / null / rejects runtime-backed manager
- [ ] 6.2 `server/sync/pty.test.ts` (create if absent): priority chain — manager > env var > default; `initialInput` presence / absence
- [ ] 6.3 `server/agents/config-writer.test.ts`: writing a manager-role agent via `POST /api/agents/config` round-trips correctly

## 7. Spec deltas

- [x] 7.1 2 ADDED requirements in `specs/dashboard/spec.md`
- [ ] 7.2 `npm run openspec -- validate add-manager-agent-config` VALID

## 8. Verification

- [ ] 8.1 `npm test && npm run typecheck && npm run build` clean
- [ ] 8.2 Manual smoke: add a `role: manager` agent via the UI, reload the terminal, verify the child process matches, and `initialInput` is injected

## 9. Post-impl

- [ ] 9.1 phase-workflow へ merge (worktree flow)
- [ ] 9.2 archive → phase-workflow に archive commit
