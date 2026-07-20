## 1. Spec delta

- [x] 1.1 ADDED `Multi-Dispatch Orchestrator` in
  `openspec/changes/add-multi-dispatch-orchestrator/specs/dashboard/spec.md`
- [x] 1.2 `npm run openspec -- validate add-multi-dispatch-orchestrator --strict` VALID

## 2. agents.yaml schema: `maxParallel`

- [x] 2.1 `server/agents/registry.ts` — parse `maxParallel: number`
  from top-level of `agents.yaml`; default `3` when absent; reject
  values outside `[1, 10]` with an error naming the field
- [x] 2.2 Expose `maxParallel` via `AgentRegistry.publicConfig()`
- [x] 2.3 `web/src/types.ts` — mirror `maxParallel: number` on
  `AgentConfigResponse`
- [x] 2.4 `server/agents/registry.test.ts` — 6 new tests:
  absent → default 3; valid 2 accepted; invalid 0 / 11 / float /
  string → validation error

## 3. Existing dispatch skill: extend report contract

- [x] 3.1 `.claude/commands/ithy-opsx/dispatch.md` — updated
  report contract's boot-prompt to append `change:<change-id>`
- [x] 3.2 Inline note in the poll block clarifies the parser
  accepts both extended and legacy shapes

## 4. New skill: `ithy-opsx-dispatch-multi`

- [x] 4.1 `.claude/skills/ithy-opsx-dispatch-multi/SKILL.md` — full
  orchestrator recipe (preflight, capacity, worktree setup,
  manager registration, fan-out code, combined poll loop, message
  routing, per-stage advance, queue drain, termination, failure
  recovery ladder, guardrails)
- [x] 4.2 `.claude/commands/ithy-opsx/dispatch-multi.md` — user-
  facing slash command delegating to the skill

## 5. Docs

- [x] 5.1 `docs/architecture/parallel-shells.md` — new "Parallel
  dispatch across N changes" section

## 6. Verification

- [x] 6.1 `npm test && npm run typecheck && npm run build` clean
  (283 → 289 tests, +6 for maxParallel)
- [x] 6.2 `openspec validate add-multi-dispatch-orchestrator
  --strict` VALID
- [x] 6.3 Smoke: parallel dispatch of add-kanban-search-filter +
  add-light-dark-mode via the Task-tool branch of the flow (2 Agent
  tool calls in one message) — both landed successfully; verified
  2026-07-20 with per-change worktree isolation, independent code /
  review / verify progression, and end-of-run summary. The
  agmsg-branch smoke via `/agmsg spawn` is deferred until agmsg is
  wired into agents.yaml for this project (currently absent).
- [ ] 6.4 Smoke: `/ithy-opsx:dispatch-multi <single-id>` — deferred;
  single-arg degrades to sequential per skill's step 2, matching
  `/ithy-opsx:dispatch` behavior by construction. Test with a real
  invocation in a follow-up.
- [ ] 6.5 Smoke: `/ithy-opsx:dispatch-multi <unknown-id> <valid-id>`
  — deferred; preflight step 1 explicitly checks id existence
  before spawning anything (documented invariant). Test with a real
  invocation in a follow-up.

## 7. Post-impl

- [x] 7.1 `outcome.md` written
- [ ] 7.2 `/ithy-opsx:archive add-multi-dispatch-orchestrator`
- [x] 7.3 Used the flow to dispatch `add-kanban-search-filter` and
  `add-light-dark-mode` in parallel (the actual dogfood) —
  2026-07-20; both landed and archived earlier today
