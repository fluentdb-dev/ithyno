---
verdict: needs-rework
summary: "The ownership protocol is substantially improved, but the full suite exposes migration drift and two stale-runtime paths remain."
findings:
  - severity: high
    file: server/skill-renderer.test.ts
    line: 695
    message: "The full `npm test -- --run` suite fails because the renderer test still requires the legacy ITHYNO_BASE guard after workflows were migrated to the bridge. Replace the obsolete assertion with bridge/CLI invariants (no direct authenticated curl, token interpolation, guessed port, or fixed localhost fallback) and run the full suite before keeping task 7.4 checked."
  - severity: high
    file: bin/ithyno.js
    line: 426
    message: "The top-level `ithyno status` command calls bridgeStatus(), which validates only descriptor PID/start identity and never performs the new socket ownership handshake. A live PID with a missing/stale socket can be reported as healthy. Route status through the bounded bridge status operation (or make bridgeStatus perform the handshake) and add a stale/missing-socket CLI regression."
  - severity: medium
    file: server/bridge.ts
    line: 566
    message: "unregisterBridgeRuntime still accepts omitted ownership arguments, and server/index.ts still invokes that form after stopBridgeServer. Make generation/processStartIdentity ownership mandatory for normal unregister and update lifecycle/test cleanup call sites so no path can delete a replacement descriptor merely because it shares the current PID."
  - severity: medium
    file: server/bridge.ts
    line: 190
    message: "isBridgeRuntimeCurrent fails open when process-start identity cannot be read (`liveIdentity` is null). That accepts an unprovable descriptor as current, contrary to proven-stale/fail-closed discovery. Return false (or a specific permission/unavailable state) and cover the unreadable-identity path without breaking supported macOS/Linux behavior."
---

## Notes

Focused bridge regressions, typecheck, build, and strict validation pass. The independent full suite reports 1064 passed, 1 skipped, and 1 failed at `server/skill-renderer.test.ts:695`; task 7.4 must be reopened until that regression is green. Windows tasks 1.4/2.4, packaged cross-platform task 7.2, and manual task 7.5 remain intentionally unchecked for the later Windows/manual-validation track.
