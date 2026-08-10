# Outcome — stabilize-dashboard-session-endpoint

## ✅ Worked

- The Electron shell now keeps a stable dashboard-session `{ port, token }` identity for the active project and reuses it for same-project reload/recovery instead of tearing down a healthy server.
- Server startup accepts an injected launcher token, preserving the same token across the dashboard session while rejecting invalid values up front.
- Manager PTYs inherit the authoritative server port/token values from the active dashboard session, and the new regression tests cover auth, PTY env propagation, and session-reuse logic.
- The cross-CLI dispatch workflow now fails closed when that injected context is missing and never retries port 4321; Agy receives the same restriction in its eager project rule.
- Endpoint/template tests, typecheck, production build, strict change validation, and all OpenSpec validations pass. The full test run passed 848 tests with one existing timing-sensitive Runner assertion failing under parallel load; its complete 11-test file passed immediately in isolation.
- Every ithyno HTTP boundary now tells the Manager to reconsider session freshness and re-expand the current environment; auth/transport failures stop instead of becoming worker failures, and AgentRunner requests use `X-Session-Token` consistently with the server contract.

## ⚠️ Surprises

- The existing reload flow was more coupled to server replacement than expected, so the fix needed to preserve the existing BrowserWindow lifecycle while changing only the session identity handling.

## 🔁 Differently

- The session identity is now sourced from the Electron launcher and the server bootstrap path rather than from the server's per-process default token alone.

## 🌱 Follow-ups

- If we later need to recover from a dead child process with a new child while preserving the session boundary, the same identity plumbing can be reused without changing the Manager-facing env contract.
