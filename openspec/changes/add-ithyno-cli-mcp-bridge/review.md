---
verdict: needs-rework
summary: "The full suite is green, but failed ownership probes can still delete a healthy runtime descriptor."
findings:
  - severity: high
    file: server/bridge.ts
    line: 656
    message: "probeBridgeRuntimeOwnership collapses EACCES/EPERM, timeout, connection failure, fragmented response data, protocol mismatch, and proven ownership mismatch into one boolean. bridgeStatus then prunes the descriptor for every false result. A sandboxed client or partial JSON frame can therefore delete a healthy server's registration. Return a typed probe result, buffer through the newline/size limit, map permission failures to `permission`, and prune only when ownership is positively disproven; add permission, fragmented-response, and timeout/no-prune regressions."
  - severity: medium
    file: server/bridge.ts
    line: 569
    message: "unregisterBridgeRuntime catches any descriptor read/parse error and force-removes the file. Read permission failure or transient I/O is not proof that the descriptor belongs to the caller. Make generation and processStartIdentity required parameters and fail closed on read/parse errors; malformed/stale cleanup belongs in the explicit pruning path. Add a regression proving an unreadable or unparsable replacement is not removed by unregister."
  - severity: medium
    file: server/bridge.ts
    line: 520
    message: "readBridgeRuntime currently prunes whenever process-start identity cannot be proven. Failure to execute/read `ps` or `/proc` can be a sandbox/permission limitation, not proof of staleness. Separate invalid/dead/mismatched descriptors from an unprovable identity and return a permission/unavailable result without deleting the descriptor."
---

## Notes

Copilot reports the complete test suite, typecheck, build, and strict validation green after commit `3aec7b4`; the renderer migration and live status handshake are fixed. Keep task 7.4 reopened until the probe/pruning regressions above are implemented and the complete suite is rerun. Windows tasks 1.4/2.4, packaged cross-platform task 7.2, and manual task 7.5 remain intentionally unchecked.
