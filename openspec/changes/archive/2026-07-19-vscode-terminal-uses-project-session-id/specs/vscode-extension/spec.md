# Delta: vscode-extension — Injected terminal uses per-project session id

## ADDED Requirements

### Requirement: Injected Terminal Startup Command

The extension SHALL send an initial "startup" command via
`sendText` before forwarding user input whenever it creates the
injected terminal (a `vscode.window.createTerminal` call made in
response to a webview message that requires the terminal). The
command choice SHALL follow the two-tier logic:

1. **Explicit override** — if the user has set the
   `ithyno.terminalStartup` config value to a non-empty string, the
   extension SHALL send that string verbatim as the startup command.
   Trailing whitespace is preserved (users controlling the exact
   shell invocation).

2. **Default (config unset or empty string)** — the extension SHALL
   read (or create) the workspace-local
   `<workspaceRoot>/.ithyno/session-id` file — a plaintext UUID v4
   — and pick between two Claude Code invocations:

   - **File missing OR empty (whitespace only)**: mint a fresh UUID
     via `crypto.randomUUID()`, ensure
     `<workspaceRoot>/.ithyno/` exists (`mkdir -p`), write
     `<uuid>\n` to the file, and send
     `claude --session-id <uuid>` (Claude Code creates a fresh
     conversation with that specific id).

   - **File present, non-empty**: send
     `claude --resume <trimmed-uuid>` (Claude Code resumes the
     previously-minted session).

This mirrors the server-side embedded PTY behavior spec'd in the
`dashboard` capability's `Embedded PTY Uses tmux When Agmsg Is
Configured` requirement.

The extension SHALL NOT send `--continue`. Explicit override remains
the escape hatch for users who prefer that behavior.

On file I/O failure (write denied, filesystem read-only, etc.), the
extension SHALL fall back to sending plain `claude` (fresh session)
and log a warning to the extension host console. It SHALL NOT
surface a modal error dialog — session-id management is transparent
by design.

The extension SHALL NOT modify `.gitignore`. If the workspace's
`.gitignore` doesn't exclude `.ithyno/`, the newly-created
`.ithyno/session-id` shows up as untracked. Documented in the
README.

The config setting's `description` in `package.json` SHALL explain
the empty-string-means-session-id semantics so users understand
how to opt in or out.

#### Scenario: config empty, workspace lacks .ithyno/session-id → mint
- **GIVEN** the workspace at `<root>` has no `.ithyno/` directory
- **AND** `ithyno.terminalStartup` is unset or an empty string
- **WHEN** the extension creates the injected terminal and needs a startup command
- **THEN** the extension mints a UUID v4, creates `<root>/.ithyno/session-id` containing that UUID (with a trailing newline), and sends `claude --session-id <uuid>` via `terminal.sendText`

#### Scenario: config empty, workspace already has session-id → resume
- **GIVEN** `<root>/.ithyno/session-id` exists containing UUID `abc123...`
- **AND** `ithyno.terminalStartup` is unset or empty
- **WHEN** the terminal is (re)created
- **THEN** the extension reads the UUID, and sends `claude --resume abc123...`

#### Scenario: config empty, session-id file empty → mint fresh
- **GIVEN** `<root>/.ithyno/session-id` exists but contains only whitespace
- **WHEN** the terminal is (re)created
- **THEN** the extension mints a new UUID, overwrites the file, and sends `claude --session-id <new-uuid>` — no broken `--resume ` line is emitted

#### Scenario: config set to explicit command → uses verbatim
- **GIVEN** `ithyno.terminalStartup` is set to `"aider"`
- **WHEN** the terminal is (re)created
- **THEN** the extension sends `aider` verbatim, does NOT read `.ithyno/session-id`, and does NOT mint anything

#### Scenario: config set to `"claude --continue"` (explicit legacy) → uses verbatim
- **GIVEN** the user prefers the pre-2026-07-19 behavior and sets `ithyno.terminalStartup` to `"claude --continue"`
- **WHEN** the terminal is (re)created
- **THEN** the extension sends `claude --continue` verbatim — the explicit override wins

#### Scenario: file write fails → fresh fallback + warn
- **GIVEN** the workspace filesystem denies writes under `.ithyno/`
- **WHEN** the extension attempts to mint + persist a UUID
- **THEN** the extension logs a warning to the extension host console and sends plain `claude` (fresh session) — no modal error dialog

#### Scenario: config set to empty string explicitly → same as unset
- **GIVEN** `ithyno.terminalStartup` is set to `""` in the user's settings.json
- **WHEN** the terminal is (re)created
- **THEN** the extension treats it identically to an unset config and applies the session-id logic
