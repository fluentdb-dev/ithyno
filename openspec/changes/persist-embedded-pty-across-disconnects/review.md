---
verdict: needs-rework
summary: "Core detach behavior is improved, but production intent routing, explicit fresh restart, concurrent spawn safety, and required lifecycle tests remain incomplete."
findings:
  - severity: high
    file: server/index.ts
    message: "The production WebSocket handler parses only identity and does not pass the request URL intent into attachPtyToSocket. Falling back to ws.url is not reliable for a server-side ws object, so reattach requests can default to create and silently spawn after server restart. Parse intent from request.url in server/index.ts and pass it explicitly, with a production-handler-level assertion or extracted routing test."
  - severity: high
    file: server/sync/pty.ts
    message: "Two simultaneous create connections for the same session key can both observe no live entry, await loadPty(), and then each spawn a PTY. Add a per-session creation lock/promise or recheck after await; test true concurrent Promise.all attachment and assert one spawn/one live PTY."
  - severity: high
    file: server/sync/pty.test.ts
    message: "Lifecycle coverage still omits input and resize after reattach, project mismatch, idle TTL kill/removal, true concurrent attach, and production shutdown wiring. Add these direct assertions; the standalone Fastify test currently recreates the hook in the test and does not prove server/index.ts registered it."
---

## Notes

- Generic unmount detaches the socket without terminating the PTY.
Manager re-review of `8ecedee`. Generic cleanup and active-socket output routing are resolved; the findings above remain blocking.
