## Context

ithyno currently composes process environments from the host process,
agent-specific configuration, and dashboard-owned `ITHYNO_*` session values.
It does not own the code-development variables used by the project being built.
Those variables remain in `.env*` files and are often required consistently by
the Manager PTY, worktree workers, tests, and build commands.

The change crosses the dashboard, local Fastify API, PTY spawning, AgentRunner,
project state, filesystem safety, and secret handling. The browser must never
become the authority for resolving or persisting environments.

## Goals / Non-Goals

**Goals:**

- Make project `.env*` files discoverable and editable from one dedicated UI.
- Keep `.env*` files as the only value source of truth and use dotenvx for
  parsing, resolution, and encryption operations.
- Give newly started Manager and worker processes the same selected profile.
- Make source, precedence, encryption state, validation findings, and restart
  requirements visible without exposing values by default.
- Preserve dashboard session authority over all `ITHYNO_*` variables.

**Non-Goals:**

- Replacing `agents.yaml`, managing operating-system variables, or managing
  ithyno's port/token values.
- Deploying production secrets or integrating cloud secret stores.
- Updating the environment of processes that are already running.
- Inventing a new env-file grammar, encryption scheme, or duplicated secret
  database.

## Decisions

### D1: Add a dedicated Development Environment route

The top-level navigation will expose an Environment screen rather than adding a
large editor to Settings. Settings remains configuration for ithyno itself;
this screen manages the code executed through ithyno.

Alternative: place the editor in Settings. Rejected because it repeats the
original ambiguity between application variables and ithyno/agent settings.

### D2: Keep resolution and filesystem access server-side

A shared `server/environment/` module will discover allowed `.env*` files,
validate profile identifiers and keys, invoke the bundled dotenvx dependency,
perform atomic writes, and compose spawn environments. Browser APIs return
masked metadata by default. A separate authenticated local request reveals one
value after an explicit user action.

Alternative: parse and merge env files in React. Rejected because it would send
all plaintext values to the browser, duplicate dotenvx behavior, and make
Electron/Extension/web behavior diverge.

### D3: Treat detected env files as explicit profiles

The first version discovers project-root files matching the supported `.env`,
`.env.local`, and `.env.<name>` forms. The selected profile records the exact
ordered file list used by dotenvx, with the selected profile taking precedence
over the base file according to dotenvx semantics. The selection is stored as
non-secret local state under `.ithyno/environment.json`; values remain only in
the env files.

Worker worktrees resolve the files from the dashboard project root, not by
copying secrets into `.worktrees/`. This keeps Manager and workers consistent
and avoids proliferating untracked secret files.

### D4: Use dotenvx as a bundled runtime dependency

ithyno will depend on the dotenvx package and invoke its supported runtime and
encryption surface through one adapter. The rest of the codebase will not
depend on dotenvx-specific argument construction. Adapter tests lock precedence
and error normalization so a future dotenvx upgrade has one review point.

Alternative: require a separately installed global CLI. Rejected because
Electron and VSIX installations need deterministic offline behavior after the
application has been installed.

### D5: Compose environments with reserved-key protection

The shared resolver returns code-development variables only. Spawn paths merge
them over the ordinary inherited environment, then apply agent-specific values
where already supported, and finally apply authoritative dashboard session
values. Any `.env*` key beginning with `ITHYNO_` is ignored and reported as a
diagnostic; it never overrides the authoritative value.

Both Manager PTY startup and AgentRunner call the same resolver. Profile edits
affect the next Manager restart and the next worker launch. The UI displays a
restart-required state while an existing Manager PTY is alive.

### D6: Make writes narrow, atomic, and reviewable

The editor always identifies one target file. The API accepts a revision token,
an operation set, and the target profile. It rejects path traversal, symlinks
escaping the project root, invalid keys, stale revisions, and reserved keys.
The server writes a sibling temporary file with restrictive permissions and
renames it atomically. Unrelated lines and comments are preserved where the
dotenvx-compatible edit permits it.

### D7: Never broadcast or log plaintext values

List, diagnostics, WebSocket, and routine error payloads contain keys, sources,
status, hashes/revisions, and masks only. Reveal and save endpoints are excluded
from structured request logging. Clipboard copying is a browser-side explicit
action after reveal and is never performed automatically.

## Risks / Trade-offs

- **dotenvx APIs or CLI arguments change** → isolate usage behind an adapter,
  pin the dependency, and test packaged Electron/VSIX artifacts.
- **An env file contains syntax the editor cannot safely round-trip** → mark
  the profile read-only with a diagnostic rather than rewriting it.
- **A secret is exposed through a reveal request** → require the existing
  local session authentication, reveal only one requested key, never cache it
  in shared state, and keep it out of logs.
- **Workers use a shared project-root env while code runs in a worktree** →
  show the source root explicitly and defer per-worktree env overrides to a
  future change.
- **Existing processes keep stale values** → never imply live mutation;
  display restart-required state and provide the existing terminal restart
  control.

## Migration Plan

1. Add the dotenvx adapter and read-only discovery/masking APIs behind the new
   route.
2. Add atomic editing, reveal, diagnostics, and encryption actions.
3. Add project-local profile selection with no default activation when no
   profile is selected, preserving current behavior.
4. Wire the shared resolver into new Manager PTYs and AgentRunner jobs.
5. Verify development, packaged Electron, and packaged VSIX execution.

Rollback removes the route and spawn integration. Existing `.env*` files are
left untouched; deleting `.ithyno/environment.json` removes only the local
selection.

## Open Questions

- Whether `.env.example` should become an optional required-key schema is
  deferred until the basic diagnostics behavior is validated.
- Per-worktree profile overrides and live tmux environment updates are deferred
  because they need separate lifecycle and secret-copying decisions.
