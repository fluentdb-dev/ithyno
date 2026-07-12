## 1. In-flight spec 注記 (CLAUDE.md hard rule)

- [ ] 1.1 Add `> ⚠️ **PENDING MODIFICATION** by [refine-manager-fallback-copy](...)` under `### Requirement: Agents Tab Manager Section` in `openspec/specs/dashboard/spec.md`

## 2. Client copy

- [ ] 2.1 `web/src/pages/Agents.tsx::ManagerSection` — Not-configured state:
  - Header: `Manager (not configured in agents.yaml):`
  - Explanation line replaces the `Source:` line: `Currently running the built-in default startup command.` when `fallbackSource === "default"`, `Currently running the command from ITHYNO_TERMINAL_STARTUP.` when `"env"`
- [ ] 2.2 Idle state message: `... will run the built-in default until you declare one.` (was: `hardcoded fallback will start`)

## 3. Spec deltas

- [x] 3.1 1 MODIFIED requirement in `specs/dashboard/spec.md`
- [ ] 3.2 `npm run openspec -- validate refine-manager-fallback-copy` VALID

## 4. Verification

- [ ] 4.1 `npm test && npm run typecheck && npm run build` clean (text-only change; no test churn)

## 5. Post-impl

- [ ] 5.1 phase-workflow へ merge (worktree flow)
- [ ] 5.2 archive → phase-workflow に archive commit
- [ ] 5.3 rebuild dist so the UI on :55910 picks up the new copy
