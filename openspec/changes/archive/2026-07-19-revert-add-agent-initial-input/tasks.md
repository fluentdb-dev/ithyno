# Tasks — revert-add-agent-initial-input

## 1. Spec deltas

- [x] 1.1 1 ADDED requirement `initialInput Field Applies Per Agent Mode`
  in `openspec/changes/revert-add-agent-initial-input/specs/agent-runner/spec.md`
- [x] 1.2 `npm run openspec -- validate revert-add-agent-initial-input --strict` VALID

## 2. Impl reverts

- [x] 2.1 No code changes. `AgentRegistry.resolve()` continues to
  populate `initialInput` + `initialInputMode` per mode; PTY and
  runner code paths consume the resolved shape as-is.

## 3. Test updates

- [x] 3.1 No test updates. `server/agents/registry-initial-input.test.ts`
  already covers both `mode: live-shell` (`initialInputMode: "stdin"`)
  and `mode: single-prompt` (`initialInputMode: "cli-arg"`) branches.

## 4. Target archive annotations

- [x] 4.1 N/A — Case β (no archived proposals to annotate)

## 5. In-flight spec 注記

- [x] 5.1 N/A — add-agent-initial-input's ADDED requirement never
  reached `openspec/specs/agent-runner/spec.md`; there's no landed
  requirement to annotate with PENDING.

## 6. Case β target archive procedure

- [x] 6.1 Rewrite `openspec/changes/add-agent-initial-input/outcome.md`
  to note it was reverted by `revert-add-agent-initial-input`
- [x] 6.2 Delete `openspec/changes/add-agent-initial-input/specs/`
- [x] 6.3 `npm run openspec -- archive add-agent-initial-input --yes`
  invoked BEFORE archiving this revert

## 7. Verification

- [x] 7.1 `npm test && npm run typecheck && npm run build` clean

## 8. Post-impl

- [x] 8.1 `outcome.md` written
- [ ] 8.2 `/ithy-opsx:archive revert-add-agent-initial-input`
  (after step 6.3 archives the target)
