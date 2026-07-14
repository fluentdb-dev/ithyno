## 1. Server: event shape

- [x] 1.1 `server/index.ts` — add `{ type: "agents-updated"; ok; error?; agents; runtimes; warnings }` to the `ServerEvent` union
- [x] 1.2 Import `AgentDef` and `RuntimeDef` types from `./agents/registry.js`

## 2. Server: broadcast in startWatching

- [x] 2.1 In `startWatching`'s callback (currently only clears runtime cache), also compute `agentRegistry.publicConfig()` and broadcast the event
- [x] 2.2 Debounce with a 100 ms timer — on rapid successive fires, reset the timer; broadcast when it settles
- [x] 2.3 Log a one-liner `[registry] broadcasting agents-updated (N agents, M warnings)` for observability

## 3. Client: WS subscription

- [x] 3.1 `web/src/store.ts` — add case for `agents-updated` in the WebSocket message handler; update `agents` and `agentConfigError` from the payload
- [x] 3.2 No separate `loadAgents()` call from the WS handler — the payload IS the fresh state

## 4. Tests

- [ ] 4.1 fs.watch integration test — deferred; wiring an end-to-end broadcast test requires spinning up a real WS server + subscriber, which is out of scope for this quick fix. The debounce is a plain setTimeout so it's testable in isolation later if needed.
- [ ] 4.2 Debounce unit test — deferred (same reason as 4.1)

## 5. Spec deltas

- [x] 5.1 1 ADDED requirement in `specs/dashboard/spec.md`
- [x] 5.2 `npm run openspec -- validate add-agents-broadcast-on-file-event` VALID

## 6. Verification

- [x] 6.1 `npm test && npm run typecheck && npm run build` clean (311 tests pass)
- [ ] 6.2 UI: open dashboard on Agents tab, edit agents.yaml in an external editor, save → tab refreshes within ~200 ms
- [ ] 6.3 UI: Modal Save still works instantly (existing e43b1d1 flow) AND the delayed broadcast is a harmless no-op
- [ ] 6.4 Editor with atomic write (vim `:w`): only ONE broadcast per save (debounce works — grep server log for `broadcasting agents-updated`)
- [ ] 6.5 Malformed edit (invalid YAML): client receives event with error state; banner appears

## 7. Post-impl

- [ ] 7.1 phase-workflow へ merge — N/A (implemented directly on phase-workflow)
- [ ] 7.2 archive after user confirms 6.2–6.5
- [x] 7.3 rebuild dist so :55910 picks up the new bundle (build clean)
