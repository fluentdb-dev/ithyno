---
tags: [phase-5, agents-tab, modal, ux, area/server, area/web]
---

# Add executable picker + role-based args presets to the Agents config Modal

## Why

Two UX gaps in the Agents config Modal surface every time a user
sets up a new agent:

1. **`command` field is a free-form text input.** Users have to
   type the path or command name from memory, and there's no way
   to browse for an executable that isn't on PATH under a name they
   remember. On macOS this bites when the CLI is installed via a
   package with a versioned wrapper (`/opt/homebrew/bin/claude-1.2`
   etc.) or hidden inside `~/.local/bin`.

2. **`args` field forces users to know the CLI's flags by heart.**
   Each supported CLI (claude, aider, codex, gh copilot, agy /
   antigravity) has a stable "how to run this in non-interactive
   mode for a `role: code` worker" incantation, but they're all
   different. Users copy-paste from `agents.yaml.example` or search
   the docs; both are papercuts.

The Modal should let users **browse** for a command and **apply a
preset args set** when the command + role combination is known.

## What Changes

### Server

1. **`POST /api/system/pick-executable`** — new endpoint that
   opens a native OS file dialog on the server's machine
   (single-user local dev tool assumption) and returns the picked
   path. Uses `osascript` on macOS, `zenity` on Linux (falls back
   with a clear error if not installed), PowerShell's
   `OpenFileDialog` on Windows. `isLocal` + CSRF gated.

### Client — command Browse

2. **`AgentConfigModal.tsx`** — inline `[Browse…]` button next
   to the `command` input. Clicking calls the endpoint and, on
   success, fills the picked path into the command field. If the
   user cancels the dialog, the field is untouched. If the endpoint
   errors (no dialog helper installed), surface an inline hint
   ("Native picker unavailable — type the path manually").

### Client — args presets

3. **`web/src/agent-cli-presets.ts`** — new module exporting a
   preset map:
   ```ts
   type Preset = { args: string[]; initialInput?: string };
   type PresetMap = Record<string, Partial<Record<AgentRole, Preset>>>;
   ```
   Populated for `claude`, `aider`, `codex`, `gh` (copilot), and
   `agy`. Lookup is by `path.basename(command)`; `/opt/homebrew/bin/claude`
   and bare `claude` both match `claude`.

4. **`AgentConfigModal.tsx`** — when the current `(command, role)`
   pair matches a preset, render an inline
   `[Use preset for claude / code]` button below the args field.
   Clicking replaces args + initialInput with the preset values.
   Displaying the button doesn't auto-apply — the user's existing
   edits stay untouched until they explicitly click.

### Spec

5. **ADDED**: `System Executable Picker Endpoint` (dashboard).
6. **ADDED**: `Agents Config Modal Command Picker`.
7. **ADDED**: `Agents Config Modal Args Presets`.

## Impact

- Adds ~2 files (server picker helper + client preset module) and
  edits Modal + api + types. No breaking changes.
- Runs OS-native dialog binaries; needs a graceful fallback when
  they're missing. Documented in the picker's error branch.
- Preset table is human-readable and lives in a client module so
  users who want to extend it copy the file into their fork.
  Long-term, moving it to `agents.presets.yaml` (a per-project
  override) is a plausible follow-up.

## Out of scope

- **Full-blown editor** for CLI + role combinations. The Modal is
  still per-agent; presets just save typing.
- **Server-side preset override**. Presets are baked into the
  client bundle for now; user forks / overrides come later.
- **Non-loopback file picker security review**. The endpoint is
  `isLocal`-gated so only local callers get to open dialogs;
  remote enterprise deployments would need their own review.
- **Antigravity (`agy`) exact flags** if unknown — preset ships
  with a `TODO: flags unknown` comment on the entry; the button
  still surfaces but a hint on the entry tells the user to fill
  in. Better than nothing.
