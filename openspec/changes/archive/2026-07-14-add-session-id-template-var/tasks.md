## 1. Server: session store

- [x] 1.1 `server/agents/session-store.ts` — new module. Exports `getOrCreateSessionId(projectRoot, changeId)` and `getSessionId(projectRoot, changeId)`. File format: `.ithyno/sessions.json` as `Record<string, string>`
- [x] 1.2 Atomic write via `.tmp` + `rename` (mirror `config-writer.ts` pattern)
- [x] 1.3 Corrupt / unparseable file → warn to `console.warn` + treat as empty map; malformed entries silently dropped; next mint overwrites
- [x] 1.4 Directory auto-created on first write (`mkdir` with `recursive: true`)
- [x] 1.5 `.gitignore` — `.ithyno/` line added

## 2. Server: template var

- [x] 2.1 `server/agents/registry.ts` — `resolve()` accepts `session_id: string` in its `vars` param; internal `replace()` helper adds `\$\{session_id\}` branch
- [x] 2.2 Missing / empty `session_id` → literal empty string substitution (matches other-vars fallback pattern)

## 3. Server: runner

- [x] 3.1 `server/agents/runner.ts` — `run(changeId, agentName, dispatchedRole?, sessionId?)` — new optional trailing param
- [x] 3.2 `run()` records `sessionId` on the created Job (falls back to `undefined` for empty)
- [x] 3.3 `run()` passes `sessionId` into `registry.resolve()` as `vars.session_id`

## 4. Server: dispatch

- [x] 4.1 `server/agents/dispatch.ts` — `DispatchInput` gains optional `sessionId?: string`
- [x] 4.2 `dispatch()` resolution order: body override → `getOrCreateSessionId(projectRoot, changeId)` (called BEFORE change-existence check per spec)
- [x] 4.3 Pass the resolved value through to `runner.run()`
- [x] 4.4 `server/index.ts` — `POST /api/agents/dispatch` handler passes `body.sessionId` through

## 5. Job model

- [x] 5.1 `Job.sessionId?: string` — new optional field in `server/agents/runner.ts`
- [x] 5.2 `JobSummary.sessionId?: string` — inherited via JobSummary/Job type union (single source of truth)
- [x] 5.3 `web/src/types.ts` — `JobSummary.sessionId?: string` client mirror

## 6. Tests

- [x] 6.1 `server/agents/session-store.test.ts` — 11 tests: fresh mint, second-call idempotence, distinct-change distinct-id, restart persistence proxy, read-only null-when-absent, read-only null-for-unknown-key, read-only returns-stored, corrupt non-JSON recovery, corrupt-array recovery, malformed-entry drop, atomic-write no-tmp-leftover
- [x] 6.2 `server/agents/registry-session-var.test.ts` — 6 tests: `${session_id}` substituted in args, env, prompts context (via env); empty when unset; empty when explicitly empty; composes with the other three template vars
- [x] 6.3 `server/agents/dispatch-session.test.ts` — 4 tests: explicit body sessionId wins (sessions.json untouched); missing → mint from store; second-call reuses stored id; non-existent changeId still mints entry then 404s
- [x] 6.4 Cross-cutting — `runCalls[0].sessionId` matches the resolved value in dispatch tests, exercising the flow through the stubbed runner

## 7. Spec deltas

- [x] 7.1 3 ADDED requirements in `specs/dashboard/spec.md`: `Template Variable Session Id`, `Change-Scoped Session Id Persistence`, `Dispatch Session Correlation`
- [x] 7.2 `npm run openspec -- validate add-session-id-template-var` VALID

## 8. Docs

- [x] 8.1 `agents.yaml.example` — added `${session_id}` to the template-variables list at the top with a short usage example (`args: [--session, "${session_id}"]`)

## 9. Verification

- [x] 9.1 `npm test && npm run typecheck && npm run build` clean (310 tests, 2 skipped)
- [x] 9.2 Configure `prompts.code: /ithy-opsx:apply ${change_id} session=${session_id}`; dispatch on `add-foo`; runner resolves args to `[--dangerously-skip-permissions, -p, /ithy-opsx:apply add-foo session=session-add-foo-<ts>]`
- [x] 9.3 `getOrCreateSessionId(root, "add-foo")` called twice → same ID returned (no re-mint)
- [x] 9.4 Fresh Node process reading the same sessions.json → same ID (persistence proxied by cross-process store lookup)
- [x] 9.5 `getOrCreateSessionId(root, "add-bar")` → distinct ID from `add-foo`
- [x] 9.6 `POST /api/agents/dispatch { changeId: does-not-exist, role: code }` returns 404 with `"change 'does-not-exist' not found"` AND sessions.json gains `does-not-exist → session-does-not-exist-<ts>`
- [x] 9.7 `POST /api/agents/dispatch { changeId: another-nonexistent, role: code, sessionId: "explicit-9" }` — sessions.json byte-identical BEFORE / AFTER (override path skips store)
- [x] 9.8 `.gitignore` includes `.ithyno/`; `git check-ignore -v .ithyno/sessions.json` confirms it's ignored; `git status --porcelain` doesn't list it

## 10. Post-impl

- [x] 10.1 phase-workflow へ merge — N/A: implemented directly on phase-workflow, no agent worktree
- [ ] 10.2 archive after user verifies 9.2–9.8
- [x] 10.3 rebuild dist so :55910 picks up the new server bundle (build clean)
