## 1. Registry: parse + resolve

- [x] 1.1 Add `initialInput?: string` to the internal `AgentDef` in `server/agents/registry.ts`
- [x] 1.2 Include `initialInput` in the YAML parse; reject with a clear error when the field is present and not a string
- [x] 1.3 Extend `resolve()` output shape to include the substituted `initialInput` (undefined when the source field is absent)
- [x] 1.4 Mirror the field in the `AgentPublic` type (`web/src/types.ts`; server surfaces via existing `publicConfig` shape)

## 2. Runner: initial write

- [x] 2.1 In `server/agents/runner.ts`, after `spawn(...)` and after `processes.set`, if `resolved.initialInput` is defined and `child.stdin` is writable, write the string with a trailing newline appended if not already present
- [x] 2.2 On success push `{ stream: "stdin", chunk, ts }` via `pushOutput` and emit `agent-job-output` with the same payload — identical path to `writeInput`
- [x] 2.3 On write error log `[runner] initial input write failed: <msg>` and continue; the child's exit handler finalizes the job

## 3. Docs + example

- [x] 3.1 Update `agents.yaml.example`: bundled Claude entry now uses `initialInput`, plus a commented `claude-print` alternative and Aider example
- [x] 3.2 Update this repo's own `agents.yaml` to the new shape so dogfood actually runs
- [x] 3.3 `docs/architecture/parallel-shells.md` — new "Feeding agents their first task via stdin" section above the interactive-prompt one

## 4. Tests

- [x] 4.1 `server/agents/registry-initial-input.test.ts` (new): `initialInput` template resolution across `${change_id}` / `${branch}`; unset case; args/env untouched
- [ ] 4.2 `server/agents/runner-initial-input.test.ts` (deferred): runner-side test would require mocking the full spawn path (registry lookup, worktree add). Covered by manual verification below and by the existing runner-input tests exercising the same underlying `pushOutput`+emit pair.

## 5. Verification

- [ ] 5.1 Restart the server (`dev:test`), spawn a worktree agent for `add-vscode-extension`
- [ ] 5.2 Agents page shows `[stdin] /opsx:apply add-vscode-extension` as the first transcript line, no `no stdin data received` warning
- [ ] 5.3 Claude proceeds to implementation; permission prompts (if any) can still be answered via the input field
- [ ] 5.4 An agent that has no `initialInput` still runs (delete/omit the field on a test entry, verify no write happens and no crash)
- [ ] 5.5 A malformed `initialInput` (e.g. `initialInput: [1,2]`) fails agents.yaml load with a clear error surfaced through `/api/agents/config`
