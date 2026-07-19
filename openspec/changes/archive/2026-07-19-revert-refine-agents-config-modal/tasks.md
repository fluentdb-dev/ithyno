# Tasks — revert-refine-agents-config-modal

## 1. Spec deltas

- [x] 1.1 1 ADDED requirement `Manager Agent Server-Side Singleton
  Guard` in `openspec/changes/revert-refine-agents-config-modal/specs/dashboard/spec.md`
- [x] 1.2 `npm run openspec -- validate revert-refine-agents-config-modal --strict` VALID

## 2. Impl reverts

- [x] 2.1 No code changes. Verified 2026-07-19 via curl against
  `POST /api/agents/config` — both delete-manager and
  upsert-second-manager return 400 with the documented error
  messages; `agents.yaml` untouched.

## 3. Test updates

- [x] 3.1 No test updates. Existing `server/agents/config-writer.test.ts`
  `"manager guardrails"` describe block already covers the guards
  the ADDED requirement encodes.

## 4. Target archive annotations

- [x] 4.1 N/A — Case β (no archived proposals to annotate)

## 5. In-flight spec 注記

- [x] 5.1 N/A — refine-agents-config-modal's MODIFIED target
  `Manager Role In agents.yaml` no longer exists in the current
  `openspec/specs/dashboard/spec.md` (removed by
  `revert-manager-agent-config`), so there's no landed requirement
  to annotate with PENDING.

## 6. Case β target archive procedure

- [x] 6.1 Rewrite `openspec/changes/refine-agents-config-modal/outcome.md`
  to note it was reverted by `revert-refine-agents-config-modal`
- [x] 6.2 Delete `openspec/changes/refine-agents-config-modal/specs/`
- [x] 6.3 `npm run openspec -- archive refine-agents-config-modal --yes`
  invoked BEFORE archiving this revert

## 7. Verification

- [x] 7.1 `npm test && npm run typecheck && npm run build` clean
  (existing tests unchanged)

## 8. Post-impl

- [x] 8.1 `outcome.md` written
- [ ] 8.2 `/ithy-opsx:archive revert-refine-agents-config-modal`
  (after step 6.3 archives refine)
