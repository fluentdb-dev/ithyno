## 1. Server: schema types

- [x] 1.1 `server/agents/registry.ts` — add `role?: string`, `specialties?: string[]`, `concurrency?: number` to `AgentDef`
- [x] 1.2 Document the defaults (`"coder"`, `[]`, `1`) in a comment next to the type so future consumers don't re-derive them
- [x] 1.3 Apply defaults during load so parsed `AgentDef`s always carry concrete values (never `undefined`) for the three fields

## 2. Server: validation

- [x] 2.1 `validateAgents()` — `role`, when present, must be a non-empty string; error names the agent and the field
- [x] 2.2 `validateAgents()` — `specialties`, when present, must be an array whose elements are all non-empty strings
- [x] 2.3 `validateAgents()` — `concurrency`, when present, must be an integer ≥ 1 (reject `0`, negatives, floats, numeric strings)
- [x] 2.4 Confirm the existing loader error path (`AgentConfig` with `ok: false`) surfaces the new messages unchanged — no new error channel

## 3. Template

- [x] 3.1 `templates/agents.yaml.example` — add a commented block under the existing agent entry showing `role`, `specialties`, `concurrency` with one-line explanations and the defaults
- [x] 3.2 Note in the comment that `concurrency` is declared capacity and NOT yet enforced

## 4. Tests

- [x] 4.1 Create `server/agents/registry.test.ts` (new file — the existing `registry-initial-input.test.ts` also needed literal updates for the new required fields; that side edit is bookkeeping, not a scope change)
- [x] 4.2 Legacy regression: an `agents.yaml` identical to the shipped example (none of the new fields) loads with `ok: true` and the defaults applied
- [x] 4.3 Fully-specified agent (`role: reviewer`, two specialties, `concurrency: 2`) round-trips through the loader intact
- [x] 4.4 Partially-specified agent (only `role`) gets defaults for the other two fields
- [x] 4.5 Each invalid shape from 2.1–2.3 produces `ok: false` with a message naming the offending agent and field
- [x] 4.6 Runner regression: role-annotated agent resolves spawn args identically (covered in new test file's last case, not by extending adopt-orphans.test.ts)

## 5. Spec delta

- [x] 5.1 `openspec/changes/add-agent-role-field/specs/agent-runner/spec.md`: ADDED requirements for metadata acceptance/defaulting, validation, and Phase-1 inertness
- [x] 5.2 `npm run openspec -- validate add-agent-role-field` passes

## 6. Verification

- [x] 6.1 Start the dashboard against a project whose `agents.yaml` predates this change → loads clean, agent starts and runs as before (verified via direct AgentRegistry.load() against tmpfs; legacy yaml with only name/command/args yielded ok:true and defaults role=coder / specialties=[] / concurrency=1)
- [x] 6.2 Add `role: reviewer` + `specialties: [area/web]` + `concurrency: 2` to an agent, reload → no error, job start behavior unchanged (verified: fields round-trip through publicConfig())
- [x] 6.3 Set `concurrency: 0` → dashboard reports the registry error naming the agent and field (verified: ok:false with error "agents[0].concurrency must be an integer >= 1")
- [x] 6.4 `npm test && npm run typecheck && npm run build` all pass
