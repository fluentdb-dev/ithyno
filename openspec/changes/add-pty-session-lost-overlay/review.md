---
verdict: needs-rework
summary: "Reload stores a new key but subsequently classifies it as reattach, so explicit fresh creation is not correctly represented."
findings:
  - severity: high
    file: web/src/components/Terminal.tsx
    message: "rotateStableTerminalSession stores nextKey, but the next mount calls readStableTerminalSession and returns intent=reattach for every stored key. Once server/index correctly passes intent, explicit Reload cannot create the fresh PTY. Persist session metadata including pending create/established state, and mark a key established only after an attached/reattached handshake."
  - severity: high
    file: web/src/components/Terminal.tsx
    message: "If the restart status/close never arrives, handleReload leaves the UI reconnecting forever. Add a bounded fallback that advances to the prepared fresh session while keeping server cleanup best-effort. Clear the timer on acknowledgement/unmount."
  - severity: medium
    file: web/src/components/Terminal.sessionState.test.ts
    message: "Tests still cover only message parsing and state arithmetic. Extract the stable-session metadata/reload transition helpers and test first create, established reload/reattach, explicit rotation staying create until handshake, missing-session loss, and acknowledgement/fallback transition."
---

## Notes

Manager re-review of `8ecedee`. Clean unmount behavior is fixed, but explicit Reload and production intent routing remain blocking.
