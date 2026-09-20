# Local bridge for CLI and MCP

The ithyno local bridge lets the CLI and MCP server operate on the current project without falling back to a guessed `localhost:4321` URL.

## What the bridge does

- resolves the project by its canonical filesystem path;
- registers a same-user runtime descriptor under the OS runtime directory;
- opens a Unix socket (or secure pipe on supported Windows paths later);
- validates the live process identity before accepting requests;
- rejects malformed, duplicated, or timed-out requests.

## Same-user and same-machine limitation

The bridge is intentionally scoped to the current user and machine. It is not a cross-user RPC layer and it does not expose a public port. This keeps it aligned with the local project sandbox and prevents accidental credential leakage.

## No port fallback

The bridge does not scan `localhost:4321`, does not invent a port, and does not rely on `ITHYNO_PORT` or `ITHYNO_BASE` for normal operation. If a runtime is not available, the result is explicit `unavailable` / `no fixed-port or localhost fallback is used` rather than a hidden fallback.

## CLI and MCP setup

Use the supported CLI entry points to manage the bridge:

```bash
ithyno status --project /path/to/project
ithyno doctor
ithyno mcp install
ithyno mcp status
ithyno mcp remove
```

Both the CLI and the MCP server strip `ITHYNO_*` values before child-process launch so credentials and session values do not leak into subprocesses.

## Troubleshooting

- If the project is a symlinked path, ithyno resolves it to a canonical root before routing requests.
- If no runtime is available, the CLI reports it as unavailable instead of trying the legacy fixed-port route.
- If a stale process is detected, the runtime is replaced and the stale entry is pruned automatically.
- If a request is malformed or duplicated, the bridge rejects it with a structured protocol error.
