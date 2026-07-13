## 1. Server: session store

- [ ] 1.1 `server/agents/session-store.ts` — new module. Exports `getOrCreateSessionId(projectRoot, changeId)` and `getSessionId(projectRoot, changeId)`. File format: `.ithyno/sessions.json` as `Record<string, string>`
- [ ] 1.2 Atomic write via `.tmp` + `rename` (mirror `config-writer.ts` pattern)
- [ ] 1.3 Corrupt / unparseable file → warn to `console.warn` + treat as empty map; next mint overwrites
- [ ] 1.4 Directory auto-created on first write (`mkdir` with `recursive: true`)
- [ ] 1.5 `.gitignore` — add `.ithyno/` line

## 2. Server: template var

- [ ] 2.1 `server/agents/registry.ts` — `resolve()` accepts `session_id: string` in its `vars` param; internal `replace()` helper adds `\$\{session_id\}` branch
- [ ] 2.2 Missing / empty `session_id` → literal empty string substitution (matches other-vars fallback pattern)

## 3. Server: runner

- [ ] 3.1 `server/agents/runner.ts` — `run(changeId, agentName, dispatchedRole?, sessionId?)` — new optional trailing param
- [ ] 3.2 `run()` records `sessionId` on the created Job (falls back to `undefined` for empty)
- [ ] 3.3 `run()` passes `sessionId` into `registry.resolve()` as `vars.session_id`

## 4. Server: dispatch

- [ ] 4.1 `server/agents/dispatch.ts` — `DispatchInput` gains optional `sessionId?: string`
- [ ] 4.2 `dispatch()` resolution order: body override → `getOrCreateSessionId(projectRoot, changeId)` (called BEFORE change-existence check per spec)
- [ ] 4.3 Pass the resolved value through to `runner.run()`
- [ ] 4.4 `server/index.ts` — `POST /api/agents/dispatch` handler passes `body.sessionId` through

## 5. Job model

- [ ] 5.1 `Job.sessionId?: string` — new optional field in `server/agents/runner.ts`
- [ ] 5.2 `JobSummary.sessionId?: string` — mirrored in the `stripOutput` type
- [ ] 5.3 `web/src/types.ts` — `JobSummary.sessionId?: string` client mirror

## 6. Tests

- [ ] 6.1 `server/agents/session-store.test.ts` — new file. Fresh mint, second-call idempotence, distinct-change distinct-id, read-only null, corrupt-file recovery, atomic-write no-tmp-leftover (6 tests minimum)
- [ ] 6.2 `server/agents/registry-reshape.test.ts` or new file — `${session_id}` substituted in args, env, prompts; empty when unset; combined with other vars
- [ ] 6.3 `server/agents/dispatch.test.ts` — explicit body sessionId wins; missing → mint from store; non-existent changeId still mints entry then 404s
- [ ] 6.4 Cross-cutting — a job spawned via `dispatch()` has its `sessionId` field set to the resolved value

## 7. Spec deltas

- [ ] 7.1 3 ADDED requirements in `specs/dashboard/spec.md`: `Template Variable Session Id`, `Change-Scoped Session Id Persistence`, `Dispatch Session Correlation`
- [ ] 7.2 `npm run openspec -- validate add-session-id-template-var` VALID

## 8. Docs

- [ ] 8.1 `agents.yaml.example` — add `${session_id}` to the template-variables list at the top; short example showing `args: [--session, "${session_id}"]` for a Claude Code worker

## 9. Verification

- [ ] 9.1 `npm test && npm run typecheck && npm run build` clean
- [ ] 9.2 Configure a worker with `args: [--session, "${session_id}"]`; dispatch on `add-foo`; observe the runner spawn log contains the resolved value
- [ ] 9.3 Dispatch on `add-foo` again — same sessionId used (no re-mint)
- [ ] 9.4 Restart server; dispatch on `add-foo` — still same sessionId (persistence)
- [ ] 9.5 Dispatch on `add-bar` — a distinct sessionId
- [ ] 9.6 `POST /api/agents/dispatch { changeId: does-not-exist, role: code }` returns 404 but sessions.json gains the orphan entry
- [ ] 9.7 `POST /api/agents/dispatch { changeId: add-foo, role: code, sessionId: "explicit-9" }` — job.sessionId = `"explicit-9"`, sessions.json unchanged for that call
- [ ] 9.8 `.gitignore` includes `.ithyno/` and `git status` does not show `.ithyno/sessions.json` after any of the above

## 10. Post-impl

- [ ] 10.1 phase-workflow へ merge
- [ ] 10.2 archive after user verifies 9.2–9.8
- [ ] 10.3 rebuild dist so :55910 picks up the new server bundle
