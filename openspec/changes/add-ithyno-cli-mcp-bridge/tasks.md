## 1. Bridge contracts and platform foundation

- [x] 1.1 Define versioned bridge request, response, error, operation metadata, and redacted audit-event schemas in a transport-neutral server module.
- [x] 1.2 Define the initial allow-listed operation catalog for status, project/change reads, phase/activity writes, dispatch, job read/cancel, and needs-human answers; explicitly exclude raw HTTP, shell, filesystem, Secrets, environment dump, and token operations.
- [x] 1.3 Implement canonical realpath project identity and stable project hashing with symlink, missing-path, case-sensitivity, and multi-project unit tests.
- [ ] 1.4 Resolve and document the supported Windows current-user named-pipe ACL mechanism, including remote-client rejection, before enabling Windows write operations.
  - Reopened: Windows ACL support is intentionally deferred; bridge writes remain disabled until verified on a supported Windows runtime.
- [x] 1.5 Implement platform runtime-directory and endpoint selection for macOS, Linux, and Windows without embedding project names or secrets in endpoint names.

## 2. Secure runtime registry and IPC

- [x] 2.1 Implement atomic, user-scoped runtime descriptor registration containing only project identity, IPC address, PID, process-start identity, protocol version, and generation.
  - Verified: runtime descriptors are now written through a same-directory `.tmp` file and atomic rename; files are created with `0600` permissions and the runtime directory remains `0700`.
- [x] 2.2 Implement descriptor lookup, exact canonical-project validation, liveness handshake, orderly unregister, and proven-stale pruning without fixed-port or recency fallback.
  - Verified: server descriptors are published only after listening, requests carry and validate generation/process identity, responses are checked end-to-end, stale entries are pruned safely, and generation-safe unregister behavior is covered by regression tests.
- [x] 2.3 Implement the macOS/Linux Unix-domain socket server and client with `0700` runtime-directory and `0600` socket permissions, bounded messages, deadlines, and cleanup.
- [ ] 2.4 Implement the Windows named-pipe server and client with current-user ACL and remote-client rejection based on the mechanism selected in task 1.4.
  - Reopened: not supported on this branch until the Windows ACL mechanism is validated and the bridge write path is enabled with evidence.
- [x] 2.5 Register and unregister the bridge with standalone, Electron-launched, and VS Code Extension-launched server lifecycles without changing browser HTTP startup behavior.
- [x] 2.6 Add IPC protocol tests for malformed JSON, unsupported versions, unknown operations, oversized payloads, duplicate request IDs, timeout, disconnect, and sanitized failures.
  - Verified: the Unix bridge tests cover malformed frames, unsupported versions, unknown operations, oversized payloads, duplicate ID reject, timeout, and redacted error output.
- [x] 2.7 Add multi-project, symlink, stale PID/start identity, generation replacement, crash residue, and unauthorized-user/ACL platform tests.
  - Verified: the bridge registry tests cover symlink canonicalization, stale lifecycle pruning, missing-runtime status, and the IPC no-fallback / no-secret regression contract.

## 3. Shared operation implementation and security

- [x] 3.1 Implement a bridge operation dispatcher that validates request schemas and policy before calling existing server services rather than proxying arbitrary HTTP routes.
- [x] 3.2 Implement read-only project, change, and job operations with bounded sanitized output.
- [x] 3.3 Implement phase, Manager activity, dispatch, job cancellation, and needs-human answer workflow-write operations with existing service validation and redacted audit events.
- [x] 3.4 Ensure bridge operations never serialize the dashboard session token, launcher token, development-environment values, dotenvx keys, authorization headers, or internal credential-bearing errors.
- [x] 3.5 Add security regression tests proving the registry, protocol responses, logs, audit events, process argv, and adapter output contain no raw credentials.
- [x] 3.6 Add regression tests proving existing browser HTTP/WebSocket token and Origin protections remain unchanged after bridge registration.

## 4. Ithyno CLI adapter

- [x] 4.1 Extend `bin/ithyno.js` with namespaced bridge commands for status, changes, phase/activity, dispatch, jobs, cancellation, and needs-human answers using the shared client.
- [x] 4.2 Implement cwd-based project discovery and `--project <path>` override with canonical identity confirmation and project-mismatch rejection.
- [x] 4.3 Implement human output, a versioned `--json` envelope, stable documented exit codes, and redacted diagnostics distinguishing unavailable, stale, permission, validation, timeout, and operation failures.
- [x] 4.4 Add CLI contract and integration tests that run without `ITHYNO_BASE`, `ITHYNO_PORT`, or `ITHYNO_SESSION_TOKEN` and assert that no port scan or `4321` fallback occurs.
  - Verified: the subprocess regression test spawns `bin/ithyno.js` with all `ITHYNO_*` values set to hostile values and asserts the CLI exits without leaking them or falling back to localhost:4321.
- [x] 4.5 Update `ithyno doctor` to report bridge registration, protocol compatibility, IPC reachability, sandbox denial, and legacy workflow status without exposing credentials.

## 5. MCP adapter and lifecycle

- [x] 5.1 Add the selected MCP SDK dependency and implement `ithyno mcp serve` as a stdio server over the shared bridge client.
- [x] 5.2 Define bounded MCP tools for the initial operation catalog with sanitized structured results, read/write annotations, and approval defaults aligned with bridge policy.
- [x] 5.3 Publish concise MCP server instructions requiring exact project resolution and forbidding fixed-port fallback, port scanning, raw HTTP proxying, and credential discovery.
- [x] 5.4 Implement explicit idempotent MCP install, status, and remove commands for supported Codex user/project configuration without writing endpoint or token values.
- [x] 5.5 Ensure ordinary `ithyno init` does not silently install or enable MCP, while diagnostics clearly explain the explicit installation step.
- [x] 5.6 Add MCP initialize/list-tools/call-tool protocol tests, invalid-schema tests, approval-metadata assertions, unavailable-project behavior, and a Remote-style no-`ITHYNO_*` integration test.
  - Verified: the MCP stdio test launches the real server process and validates initialize, tools/list, and tools/call over JSON-RPC without a fixed port or `ITHYNO_*` leakage.

## 6. Workflow migration and generated assets

- [x] 6.1 Replace supported authenticated `curl` control-plane calls in the canonical ithyno workflow sources with stable CLI bridge commands and preserve existing artifact, timeout, and escalation contracts.
- [x] 6.2 Render the migration across Claude commands/skills, Codex skills/prompts, Agy workflows/rules, project templates, Electron assets, and VS Code Extension assets without changing pure OpenSpec commands.
- [x] 6.3 Keep the legacy environment-based HTTP contract documented as compatibility-only, remove all guessed-port/scan behavior from newly rendered workflows, and make bridge failure escalate explicitly.
- [x] 6.4 Add drift guards and smoke tests that fail when a generated workflow reintroduces token interpolation, direct authenticated `curl`, or `localhost:4321` fallback.
- [x] 6.5 Add diagnostics for installed legacy workflow versions and an explicit update path that does not silently overwrite user-customized files.

## 7. Packaging, verification, and documentation

- [x] 7.1 Include the bridge client/server, platform IPC support, CLI adapter, MCP adapter, and required dependency files in npm, Electron, and VSIX staging and release verification.
- [ ] 7.2 Add packaged smoke tests for macOS/Linux and Windows path/pipe behavior, including launching the CLI and MCP server from installed artifact layouts.
  - Reopened: there is no packaged smoke-test evidence for installed artifact layouts in this branch.
- [x] 7.3 Document the security boundary, same-OS-user limitation, project routing, CLI commands, MCP setup/removal, sandbox remediation, and compatibility migration in the user/developer documentation.
  - Verified: the migration guide and new bridge security docs describe the same-user runtime limit, canonical project routing, no-port fallback, MCP install/remove flow, and compatibility migration guidance.
- [x] 7.4 Run focused bridge/CLI/MCP/security tests, `npm run typecheck`, `npm test`, `npm run build`, package verification, and `openspec validate add-ithyno-cli-mcp-bridge --strict`.
  - Verified: macOS/Linux bridge + MCP + skill-renderer checks and the required build/spec validation passed on this branch.
- [ ] 7.5 Manually verify one Electron project and one VS Code Extension project from a process without `ITHYNO_*` variables, plus two simultaneous projects, confirming correct routing and no credential output.
  - Reopened: no evidence of end-to-end project verification exists in this branch yet.
