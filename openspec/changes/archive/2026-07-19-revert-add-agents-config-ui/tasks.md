# Tasks — revert-add-agents-config-ui

## 1. Spec deltas

- [x] 1.1 1 ADDED requirement `Agents Config Delete Confirmation
  And Add Button` in
  `openspec/changes/revert-add-agents-config-ui/specs/dashboard/spec.md`
- [x] 1.2 `npm run openspec -- validate revert-add-agents-config-ui --strict` VALID

## 2. Impl reverts

- [x] 2.1 No code changes. `web/src/pages/Agents.tsx` still
  renders `DeleteConfirmDialog` and `[+ Add agent]`;
  `AgentConfigModal.tsx` still opens on Add / Edit.

## 3. Test updates

- [x] 3.1 No test updates. Existing
  `web/src/components/AgentConfigModal.test.ts` (kebab-case
  suite) is unaffected.

## 4. Target archive annotations

- [x] 4.1 N/A — Case β (no archived proposals to annotate)

## 5. In-flight spec 注記

- [x] 5.1 N/A — add-agents-config-ui's 3 ADDED requirements never
  reached `openspec/specs/dashboard/spec.md`.

## 6. Case β target archive procedure

- [x] 6.1 Rewrite `openspec/changes/add-agents-config-ui/outcome.md`
  to note it was reverted by `revert-add-agents-config-ui`
- [x] 6.2 Delete `openspec/changes/add-agents-config-ui/specs/`
- [x] 6.3 `npm run openspec -- archive add-agents-config-ui --yes`
  invoked BEFORE archiving this revert

## 7. Verification

- [x] 7.1 `npm test && npm run typecheck && npm run build` clean

## 8. Post-impl

- [x] 8.1 `outcome.md` written
- [ ] 8.2 `/ithy-opsx:archive revert-add-agents-config-ui`
  (after step 6.3 archives the target)
