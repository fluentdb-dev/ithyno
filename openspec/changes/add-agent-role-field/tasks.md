## 1. Server: schema types

- [ ] 1.1 `server/agents/registry.ts` — add `role?: string`, `specialties?: string[]`, `concurrency?: number` to `AgentDef`
- [ ] 1.2 Document the defaults (`"coder"`, `[]`, `1`) in a comment next to the type so future consumers don't re-derive them
- [ ] 1.3 Apply defaults during load so parsed `AgentDef`s always carry concrete values (never `undefined`) for the three fields

## 2. Server: validation

- [ ] 2.1 `validateAgents()` — `role`, when present, must be a non-empty string; error names the agent and the field
- [ ] 2.2 `validateAgents()` — `specialties`, when present, must be an array whose elements are all non-empty strings
- [ ] 2.3 `validateAgents()` — `concurrency`, when present, must be an integer ≥ 1 (reject `0`, negatives, floats, numeric strings)
- [ ] 2.4 Confirm the existing loader error path (`AgentConfig` with `ok: false`) surfaces the new messages unchanged — no new error channel

## 3. Template

- [ ] 3.1 `templates/agents.yaml.example` — add a commented block under the existing agent entry showing `role`, `specialties`, `concurrency` with one-line explanations and the defaults
- [ ] 3.2 Note in the comment that `concurrency` is declared capacity and NOT yet enforced

## 4. Tests

- [ ] 4.1 Create `server/agents/registry.test.ts` (new file — the existing `registry-initial-input.test.ts` stays untouched, it covers a separate concern)
- [ ] 4.2 Legacy regression: an `agents.yaml` identical to the shipped example (none of the new fields) loads with `ok: true` and the defaults applied
- [ ] 4.3 Fully-specified agent (`role: reviewer`, two specialties, `concurrency: 2`) round-trips through the loader intact
- [ ] 4.4 Partially-specified agent (only `role`) gets defaults for the other two fields
- [ ] 4.5 Each invalid shape from 2.1–2.3 produces `ok: false` with a message naming the offending agent and field
- [ ] 4.6 Runner regression (extend `adopt-orphans.test.ts` or a similar existing test if simpler than a new one): starting a job with a role-annotated agent takes the identical spawn path (same worktree location, same args) as before

## 5. Spec delta

- [ ] 5.1 `openspec/changes/add-agent-role-field/specs/agent-runner/spec.md`: ADDED requirements for metadata acceptance/defaulting, validation, and Phase-1 inertness
- [ ] 5.2 `npm run openspec -- validate add-agent-role-field` passes

## 6. Verification

- [ ] 6.1 Start the dashboard against a project whose `agents.yaml` predates this change → loads clean, agent starts and runs as before
- [ ] 6.2 Add `role: reviewer` + `specialties: [area/web]` + `concurrency: 2` to an agent, reload → no error, job start behavior unchanged
- [ ] 6.3 Set `concurrency: 0` → dashboard reports the registry error naming the agent and field
- [ ] 6.4 `npm test && npm run typecheck && npm run build` all pass
