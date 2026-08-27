---
id: fix-vsix-cli-path
---

## Context

On Windows, VS Code launches with the system + user PATH from the Windows
registry (`HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment`
and `HKCU\Environment`). Shell profiles (PowerShell `$PROFILE`, etc.) are never
sourced. Tools installed via methods that only modify shell profiles — or that
use a PATH entry added to a shell rc file but not to the registry — are invisible
to the extension host.

Common tools that fall in this category:
- `claude` / `codex` / `agy` installed via `npm install -g` when npm global bin
  (`%APPDATA%\npm`) is not (yet) in the registry PATH (e.g. nvm-windows or older
  Node.js installs that didn't write to registry).
- User-local binaries in `%USERPROFILE%\.local\bin` (e.g. psmux, custom scripts).

`spawnServer` passes `{ env: { ...process.env } }` to the child, so the spawned
ithyno server inherits exactly the same limited PATH.

## Goals

- `commandExistsOnPath("claude")` (and other CLIs) returns `true` when the tool
  is installed via npm global on Windows, regardless of how VS Code was launched.
- `%USERPROFILE%\.local\bin` is included so user-local tools (like psmux) are
  also found.

## Non-Goals

- Full shell profile sourcing (complex, slow, OS version dependent).
- Making every possible CLI installation path work.

## Decisions

### Augment PATH with known Windows user-level directories

Before spawning the server, append the following directories to `PATH` if they
are not already present:
- `%APPDATA%\npm` — npm global bin (default for system Node.js install)
- `%USERPROFILE%\.local\bin` — user-local binaries

Only add a directory if it exists on disk, to avoid polluting PATH with ghost
entries. Skip any directory already present in PATH.

### Where to apply

In `server-spawner.ts`, `spawnServer()`, before constructing the `env` object
passed to `spawn()`. Windows-only guard (`process.platform === 'win32'`).

## Risks

- If a user has a different npm global prefix set (`npm config get prefix`), the
  added `%APPDATA%\npm` entry may not be where their CLIs live. This covers the
  common case; non-standard setups may still fail.
