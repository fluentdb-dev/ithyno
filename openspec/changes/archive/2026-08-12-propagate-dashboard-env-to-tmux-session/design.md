## Context

`buildManagerPtyEnv()` supplies the active dashboard's port, base URL, and session token to the shell that launches the Manager. When tmux is enabled, that shell runs `tmux new-session -A`; tmux may outlive the PTY and retain a session environment created by an earlier dashboard attachment.

tmux provides two relevant mechanisms: repeated `-e VARIABLE=value` arguments initialize a newly created session, while the `update-environment` option copies selected variables from an attaching client into an existing session.

## Goals / Non-Goals

**Goals:**

- Make the tmux session environment carry the attaching dashboard's authoritative `ITHYNO_PORT`, `ITHYNO_BASE`, and `ITHYNO_SESSION_TOKEN`.
- Cover both new-session creation and `-A` attachment.
- Avoid embedding the resolved token value in server logs or the generated startup string.
- Preserve Manager command quoting, custom tmux session names, and initial-input behavior.

**Non-Goals:**

- Change the lifetime or generation policy of dashboard session tokens.
- Modify ithyno Skills or HTTP APIs.
- Mutate the operating-system environment of a process already running in an existing pane; tmux session environment changes apply to processes tmux launches afterward.

## Decisions

### D1: Initialize new sessions with explicit `-e` arguments

Append one `-e` argument for each authoritative variable before the Manager command separator. The generated string contains shell references such as `ITHYNO_SESSION_TOKEN="$ITHYNO_SESSION_TOKEN"`; expansion occurs in the PTY shell at execution time, so the server's startup log does not contain the token value.

Relying only on tmux's implicit inheritance was rejected because the required contract would remain invisible and vulnerable to future tmux invocation changes.

### D2: Register the same names with `update-environment`

Before `new-session -A`, inspect tmux's global `update-environment` list and append the three names when they are absent. On attachment, tmux then copies the current PTY client's values into the existing session environment.

Blindly appending on every launch was rejected because it would grow the option indefinitely. Replacing the entire option was rejected because it would discard user-defined entries.

### D3: Keep startup construction CLI-independent

Apply the tmux environment prefix after resolving the Manager CLI command. Claude, Codex, Agy, and other configured Managers therefore receive identical tmux session handling without CLI-specific branches.

## Risks / Trade-offs

- **Existing pane processes retain their original OS environment.** → Treat the tmux session environment as the contract for newly launched panes and processes. A future requirement to replace an already-running Manager must explicitly define pane respawn behavior.
- **The shell expands the token for tmux's `-e` argument.** → Keep the literal value out of generated strings and application logs; the tmux client already holds the same token in its inherited environment.
- **Older tmux versions may not support repeated `-e`.** → ithyno already detects tmux availability; tests lock the supported invocation shape and unsupported environments continue to use the existing non-tmux fallback banner.

## Migration Plan

No stored-data migration is required. The next Manager terminal start uses the new startup command. Rollback restores the previous `new-session -A` command and its unit-test expectations.

## Open Questions

None.
