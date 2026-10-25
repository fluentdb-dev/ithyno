## Why

The tmux session browser makes windows, panes, and retained history visible, but users must still memorize tmux prefix shortcuts or leave ithyno to perform common session operations. An interactive cheat sheet can teach the shortcuts while offering an equivalent, discoverable UI path for the same bounded actions.

## What Changes

- Add an interactive tmux cheat sheet to the embedded terminal's tmux browser.
- Group common actions by navigation, pane layout, window management, history, and session control, and show each action's native tmux shortcut.
- Make supported entries clickable so users can invoke the equivalent action without typing the shortcut.
- Add an explicit Stop session action that resolves the current canonical project session and stops the Manager plus every window and pane for that session.
- Execute actions through an explicit server-side allowlist and structured arguments rather than accepting arbitrary tmux commands or keystrokes.
- Refresh the project-scoped topology after an action and preserve the Manager PTY, terminal connection, and current dashboard state.
- Distinguish available, provider-unsupported, and intentionally non-executable shortcuts in the UI, including provider-specific degradation for psmux.
- Keep pane and window kill shortcuts reference-only; the supported close action is limited to the current project session and never accepts a client-supplied target.

## Capabilities

### New Capabilities

- `tmux-interactive-controls`: Discoverable tmux shortcut reference and allowlisted UI actions for navigating and managing the current ithyno-owned tmux session.

### Modified Capabilities

- `tmux-session-browser`: Extended to support allowlisted create, split, navigate, and layout actions within the current ithyno-managed project session, plus explicitly confirmed pane-close and session-stop actions.

## Impact

- Depends on the topology, selection, and history foundation introduced by `add-tmux-session-browser-and-history`.
- Adds typed tmux action models, validation, provider capability reporting, and project-scoped action endpoints to the server.
- Extends the embedded Electron/browser terminal UI and API client; VS Code delegated-terminal behavior remains unchanged.
- Adds tests ensuring actions cannot target another project session, invoke destructive reference-only entries, or inject arbitrary tmux arguments.
