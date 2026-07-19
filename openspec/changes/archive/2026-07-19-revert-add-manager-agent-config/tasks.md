# Tasks — revert-add-manager-agent-config

## 1. Spec deltas

- [x] 1.1 1 ADDED requirement `Manager Entry Drives Fresh PTY Startup`
  in `openspec/changes/revert-add-manager-agent-config/specs/dashboard/spec.md`
- [x] 1.2 `npm run openspec -- validate revert-add-manager-agent-config --strict` VALID

## 2. Impl reverts

- [x] 2.1 No code changes. The 3-tier priority chain remains
  encoded in `server/sync/pty.ts::ptyStartup(registry)`, unchanged
  since add-manager-agent-config's original impl.

## 3. Test updates

- [x] 3.1 No test updates. Existing `server/sync/pty.test.ts` (7
  tests) already covers all priority tiers.

## 4. Target archive annotations

- [x] 4.1 N/A — Case β (no archived proposals to annotate)

## 5. In-flight spec 注記

- [x] 5.1 N/A — add-manager-agent-config's 2 ADDED requirements
  never reached `openspec/specs/dashboard/spec.md`; there's no
  landed requirement to annotate with PENDING.

## 6. Case β target archive procedure

- [x] 6.1 Rewrite `openspec/changes/add-manager-agent-config/outcome.md`
  to note it was reverted by `revert-add-manager-agent-config`
- [x] 6.2 Delete `openspec/changes/add-manager-agent-config/specs/`
- [x] 6.3 `npm run openspec -- archive add-manager-agent-config --yes`
  invoked BEFORE archiving this revert

## 7. Verification

- [x] 7.1 `npm test && npm run typecheck && npm run build` clean
  (existing tests unchanged)

## 8. Post-impl

- [x] 8.1 `outcome.md` written
- [ ] 8.2 `/ithy-opsx:archive revert-add-manager-agent-config`
  (after step 6.3 archives the target)
