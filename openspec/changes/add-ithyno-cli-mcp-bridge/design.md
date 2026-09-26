## Context

The dashboard server already owns the authoritative project root, ephemeral HTTP port, and per-session token. The embedded Manager PTY receives `ITHYNO_BASE`, `ITHYNO_PORT`, and `ITHYNO_SESSION_TOKEN`, and bundled workflows currently use those values to assemble `curl` requests. That works only for descendants of the Manager PTY. Codex Remote, a separately launched CLI, and future host integrations run as different processes and do not inherit that environment.

Passing the token through command arguments, shell startup files, project configuration, or MCP configuration would make discovery easier but would widen credential exposure and create stale-token behavior after a server restart. MCP alone does not solve discovery: an MCP process still needs a deterministic way to identify the correct live ithyno session when several projects are open.

This change therefore introduces one local control plane and two thin adapters. The existing HTTP server and browser authentication remain intact.

## Goals / Non-Goals

**Goals:**

- Resolve a caller's canonical project root to the exact live ithyno session without fixed ports or "most recent project" heuristics.
- Keep the dashboard session token inside the trusted ithyno process boundary.
- Share operation schemas, validation, authorization, timeout behavior, and error mapping between the CLI and MCP adapters.
- Support macOS, Linux, and Windows with user-scoped local IPC.
- Work when the caller has no `ITHYNO_*` environment variables, including Codex Remote-style processes.
- Preserve existing HTTP/UI behavior and provide a staged migration for current skills.

**Non-Goals:**

- Replacing the dashboard HTTP or WebSocket API with MCP.
- Exposing ithyno over a LAN or public network.
- Making the local bridge a general remote-execution service.
- Returning Secrets values, dotenvx private keys, or the dashboard session token through CLI or MCP.
- Removing Manager PTY environment variables in this change.
- Treating MCP support as mandatory for Claude, Agy, Copilot, or other clients that can use the CLI adapter.

## Decisions

### D1: Introduce one transport-neutral bridge core

The server will define an allow-listed operation registry with shared input/output schemas. IPC requests, CLI subcommands, and MCP tools map to those operations; adapters do not call arbitrary HTTP paths or duplicate authentication logic.

Initial operation families are:

- bridge status and project identity;
- change list/detail and phase/activity mutation;
- AgentRunner dispatch, job inspection, and cancellation;
- needs-human question inspection and answer submission.

Secrets management, raw filesystem access, arbitrary shell execution, and raw HTTP proxying are excluded.

Alternative considered: implement separate CLI and MCP clients over the HTTP API. Rejected because it duplicates endpoint/token discovery and lets both adapters become credential holders.

### D2: Resolve sessions by canonical project identity

Every server registers a descriptor keyed by a hash of its canonical, realpath-resolved project root. A caller supplies or derives a project path; the bridge resolves it to the same canonical representation and requires an exact match. The registry never selects a globally "active" or most-recent session.

Descriptors contain only non-secret routing and liveness metadata: canonical project root, IPC address, PID, process start identity, and session generation. Writes are atomic. The server removes its descriptor on orderly shutdown, and clients reject stale PID/generation/socket combinations.

Alternative considered: a project-local file containing port and token. Rejected because it exposes credentials to every process and tool that can read the repository and is easy to copy accidentally.

### D3: Use OS-local IPC as the trust boundary

- macOS/Linux use a Unix-domain socket inside a user-only runtime directory. The directory is mode `0700` and the socket is mode `0600` where supported.
- Windows uses a named pipe that rejects remote clients and applies an ACL for the owning user SID.
- The server verifies the requested project identity again after connection and never returns the HTTP session token.

The IPC protocol is length-bounded, versioned JSON request/response messaging. It has request IDs, operation names, schema validation, deadlines, and bounded responses. Unknown operations and excess payloads are rejected before execution.

Alternative considered: localhost HTTP with a token file. It is acceptable only as a temporary implementation fallback because it still creates a second bearer credential distribution problem.

### D4: Apply operation-level policy rather than trusting the executable name

The bridge classifies operations as read-only, workflow-write, or privileged. Read-only operations can run automatically. Workflow writes are restricted to the documented operation set and produce audit events. Privileged operations, including Secrets access or arbitrary execution, are not exposed by this change.

MCP tools declare read/write semantics and approval defaults. CLI commands use the same server-side policy; calling a binary named `ithyno` is not itself authorization.

The threat boundary is explicit: user-scoped IPC prevents access by other OS users and remote hosts, but cannot fully isolate a malicious process already running with unrestricted access as the same OS user. Server-side operation restrictions therefore remain mandatory.

### D5: Keep the CLI thin and automation-safe

The existing `ithyno` executable gains namespaced commands rather than a second binary. Commands accept `--project <path>` and otherwise derive the nearest owning project from cwd. Human output is the default; `--json` emits a versioned envelope. Exit codes distinguish usage, unavailable/stale session, authorization, validation, timeout, and operation failure.

The CLI connects directly to local IPC using a library API. It does not invoke `curl`, put credentials in argv or environment variables, or print secret-bearing diagnostics.

Dashboard startup uses the explicit `ithyno start` subcommand so it is not confused with bridge or MCP operations. Bare `ithyno` remains a compatibility alias during the migration window and prints a deprecation notice. Startup validates the requested port before spawning the server and replaces raw `EADDRINUSE` stack output with actionable commands for inspecting an existing project session or selecting another port.

### D6: Implement MCP as a stdio adapter over the same client

`ithyno mcp serve` starts a stdio MCP server. Tools use the bridge operation schemas and return sanitized structured content. The server advertises concise instructions that require exact project selection and forbid guessed ports or raw token discovery.

Codex installation writes only the command and safe project-selection configuration. No endpoint or bearer token is stored in `~/.codex/config.toml` or `.codex/config.toml`. Installation is explicit and idempotent, supports status/remove, and does not silently enable MCP during ordinary project init.

This choice uses Codex's shared host MCP configuration while keeping the credential and live-session resolution within ithyno. Other clients may adopt the same MCP server later without making it the only supported path.

### D7: Migrate workflows to the CLI before removing the legacy path

Bundled ithyno skills and rendered templates will invoke stable CLI commands for control-plane operations. During migration, the existing environment-based HTTP path remains a compatibility path only when explicitly selected or when using an older installed template. New workflows must not guess port `4321`, scan ports, or read tokens from another process.

Template drift tests cover Claude commands, Codex prompts/skills, Agy workflows/rules, and packaged Electron/VS Code assets that contain the affected workflow text.

### D8: Package and test the bridge as a product surface

Release bundles include the CLI adapter, MCP adapter, IPC modules, and any platform helper required for secure named-pipe ACLs. Verification includes bundle-content tests, CLI contract tests, MCP protocol tests, multi-project routing tests, stale descriptor recovery, secret-redaction tests, and packaged smoke tests without `ITHYNO_*` variables.

Project initialization installs ithyno as a project-local development dependency alongside OpenSpec. The launcher/build selects the package source explicitly: source development runs use the current checkout, locally packaged debug Electron/VSIX builds embed an npm tarball made from that checkout, and release builds use the version-matched npm-format tarball attached to the GitHub Release. The initialization chain does not infer this channel from `.git`, `NODE_ENV`, or the target project. The npm registry is not an assumed distribution channel. Generated workflows resolve the project-local binary without downloading at invocation time. This makes the workflow version follow the initializing product build instead of an unrelated global install, while MCP installation remains an explicit, separate action.

VS Code New Project starts its temporary server before the selected project has necessarily been created. Its lightweight Manager-selection preflight therefore honors `autoCreateDir` and `autoGitInit` before writing `agents.yaml`; the subsequent streamed chain remains the owner of template, dependency, and OpenSpec initialization. The server receives an internal onboarding launch flag so the expected pre-initialization absence of Git and `openspec/` is not logged as a dashboard startup failure.

## Risks / Trade-offs

- **[Platform IPC differences]** Unix permissions and Windows named-pipe ACLs do not have identical APIs. → Hide them behind a small transport interface and require platform-specific security tests before enabling writes.
- **[Same-user malicious process]** A process with unrestricted access as the same user may still invoke allowed operations. → Expose a narrow operation catalog, omit Secrets and arbitrary execution, retain approvals for write tools, and audit mutations.
- **[Sandbox blocks IPC]** An agent sandbox may deny access to the runtime socket or pipe. → Surface a precise permission error and document a narrow approval for the `ithyno` CLI or configured MCP server; never fall back to port guessing.
- **[Stale descriptors]** Crashes can leave registry entries. → Bind entries to PID, process-start identity, generation, and a live handshake; prune only entries proven stale.
- **[MCP client differences]** Tool annotations and configuration support vary by client/version. → Keep MCP additive and retain the CLI adapter as the cross-client baseline.
- **[Migration drift]** Installed project skills may continue direct HTTP calls. → Update source templates, add drift guards, and expose diagnostics that identify legacy workflows without rewriting user-customized files silently.
- **[Scope size]** IPC, CLI, MCP, packaging, and workflow migration cross many modules. → Implement in ordered layers with the bridge/CLI contract complete before MCP and template adoption.

## Migration Plan

1. Add the operation registry, secure runtime registry, IPC server/client, and read-only status operation behind an opt-in feature flag.
2. Add CLI read operations, then workflow write operations with security and cross-platform tests.
3. Add explicit MCP install/status/remove commands and the stdio adapter using the proven bridge client.
4. Update bundled workflow sources and generated templates to prefer CLI commands; keep current environment variables and HTTP endpoints operational.
5. Enable bridge registration by default for Electron, VS Code Extension, and standalone dashboard servers after packaged smoke tests pass.
6. Document the compatibility window. Removal of direct token-based skill calls, if desired, requires a later change.

Rollback disables bridge registration and MCP configuration while leaving the unchanged dashboard HTTP API and Manager PTY environment path available.

## Open Questions

- Confirm the minimum supported Windows APIs/runtime needed to apply a current-user-only named-pipe ACL without adding a large native dependency. This must be resolved in the platform foundation task before write operations are enabled on Windows.
