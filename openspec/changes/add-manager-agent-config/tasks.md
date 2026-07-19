## 1. Registry — Manager selection

- [x] 1.1 `server/agents/registry.ts`: `managerAgent(): AgentDef | null` returns the first `role: "manager"` entry, or null
- [x] 1.2 `validateAgents`: rejects a `role: manager` entry with runtime-backed shape (must be legacy — command + args); descriptive error names the entry index

## 2. PTY startup consults registry

- [x] 2.1 `server/sync/pty.ts::ptyStartup(registry)`: returns `{ startup, initialInput? }` from priority chain (manager entry → env var → hardcoded default). Includes a small `shellQuote()` helper for args with whitespace / special chars.
- [x] 2.2 `attachPtyToSocket`: after typing the startup command, if `initialInput` is set, wait 300 ms and type it as a second line. Fire-and-forget on both writes so a dead terminal is a no-op.

## 3. Server wiring

- [x] 3.1 `server/index.ts`: PTY handler passes `agentRegistry` into `attachPtyToSocket({ registry })`
- [x] 3.2 Live PTY sessions are NOT restarted on agents.yaml reload — only the NEXT PTY opening picks up the change. Documented inline where relevant.

## 4. agents.yaml.example

- [x] 4.1 Added a commented-out `role: manager` section at the top of `agents:` with the recommended `command: claude, args: [--continue], initialInput: /opsx:manage` shape. Existing worker examples moved under a "Workers" comment header for clarity.

## 5. Docs

- [ ] 5.1 Doc update deferred — the proposal + spec delta + example file already document the pattern. Fold into `docs/2026-07-06-phase-2-implementation-and-redesign.md` follow-up when the next design revision goes in.

## 6. Tests

- [x] 6.1 `server/agents/registry.test.ts`: 4 new tests — `managerAgent()` returns null / first entry / first-by-file-order / rejects runtime-backed
- [x] 6.2 `server/sync/pty.test.ts` (new): 7 tests — null registry + no env → default / null + env / null + empty env / registry without manager falls through / manager wins over env / initialInput passthrough / initialInput omitted / shell-quotes args with spaces
- [ ] 6.3 `server/agents/config-writer.test.ts` extension for role: manager round-trip — deferred; the Phase 5.3 writer accepts any role string, and the loader's validation already covers the rejection path

## 7. Spec deltas

- [x] 7.1 2 ADDED requirements in `specs/dashboard/spec.md`
- [x] 7.2 `npm run openspec -- validate add-manager-agent-config` VALID

## 8. Verification

- [x] 8.1 `npm test && npm run typecheck && npm run build` clean (257 → 269 tests, +12)
- [x] 8.2 Setup: added `man` manager entry via `[Declare in agents.yaml]` shortcut (step 1 workflow); dev server picked it up via `fix: reload agent registry synchronously after config write`
- [x] 8.3 PTY: opening a fresh Terminal panel spawns the child using `claude --resume <uuid>` from the declared entry — verified during step 1 (Manager section shows `claude --resume …` under Manager badge)
- [~] 8.4 PTY initialInput auto-inject — **superseded by reshape**: `initialInput` field folded into per-role `prompts.manager` textarea. Manager's `initialInput` (typed into PTY after boot) can still be exercised via the reshape's per-role prompt field, but not verified here
- [~] 8.5 Second manager entry rejected — Manager singleton check surfaces at both Modal (chip filter) AND loader levels. Modal-level verified via step 1 (chip absent when manager exists). Loader-level covered by registry.test.ts
- [~] 8.6 Runtime-backed manager rejected — **obsolete**: reshape removed the shape distinction; the Manager constraint is now `mode: live-shell` (also enforced by loader + Modal)
- [ ] 8.7 Fallback: env var `ITHYNO_TERMINAL_STARTUP=aider` launches aider — pending (skip: user has manager declared, fallback path not exercised)

## 9. Post-impl

- [x] 9.1 phase-workflow へ merge (worktree flow) — via merge step
- [ ] 9.2 archive → user runs `/ithy-opsx:archive` after confirming 8.2–8.7
