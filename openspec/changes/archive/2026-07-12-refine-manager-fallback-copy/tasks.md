## 1. In-flight spec 注記 (CLAUDE.md hard rule)

- [x] 1.1 Added `> ⚠️ **PENDING MODIFICATION** by [refine-manager-fallback-copy](...)` under `### Requirement: Agents Tab Manager Section` in `openspec/specs/dashboard/spec.md`

## 2. Client copy

- [x] 2.1 `web/src/pages/Agents.tsx::ManagerSection` — Not-configured state:
  - Header: `Manager (not configured in agents.yaml):` (was `Manager (fallback):`)
  - Explanation line: `Currently running the built-in default startup command.` when `fallbackSource === "default"`, `Currently running the command from ITHYNO_TERMINAL_STARTUP.` when `"env"` (replaces `Source: <label>`)
- [x] 2.2 Idle state message: `will run the built-in default until you declare one.` (was: `will run the hardcoded default until you declare one.`)

## 3. Spec deltas

- [x] 3.1 1 MODIFIED requirement in `specs/dashboard/spec.md`
- [x] 3.2 `npm run openspec -- validate refine-manager-fallback-copy` VALID

## 4. Verification

- [x] 4.1 `npm test && npm run typecheck && npm run build` clean (no tests touched — text-only)

## 5. Post-impl

- [x] 5.1 phase-workflow へ merge (worktree flow) — via merge step
- [x] 5.2 archive → phase-workflow に archive commit — via archive step
- [x] 5.3 rebuild dist so the UI on :55910 picks up the new copy — via post-archive build
