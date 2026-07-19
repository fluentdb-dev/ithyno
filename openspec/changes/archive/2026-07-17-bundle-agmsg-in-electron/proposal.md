---
tags: [feature/agents, feature/messaging, feature/electron, area/electron, agmsg, phase-3-of-3]
---

# Bundle fujibee/agmsg with the Electron shell (auto-install on first launch)

## Why

P1/P2/P2b-c landed the agmsg pipeline: config surface, tmux wrap,
dispatcher branch. All three work only if `~/.agents/skills/agmsg/
scripts/send.sh` exists on the user's machine — a state that today
requires the user to run `/plugin marketplace add fujibee/agmsg`
inside their Claude session. That's a manual step outside ithyno's
control and outside the "just double-click ithyno.app and go" UX
we want for the Electron distribution.

P3 vendors agmsg's shell scripts inside ithyno's Electron package
and, on first launch, copies them into `~/.agents/skills/agmsg/` if
that directory is empty. The result: a fresh macOS/Linux install of
ithyno.app has a working agmsg pipeline without the user knowing
anything about npm, npx, or Claude's plugin marketplace.

CLI users (`npm install ithyno` / `ithyno` command) are unaffected —
they continue to need a manual `/plugin marketplace add fujibee/
agmsg` step. That's an acceptable trade-off; CLI users are already
in a shell and comfortable with an install step.

fujibee/agmsg ships under **MIT** license (verified 2026-07-17),
compatible with ithyno's GPL-3.0-or-later — vendoring is permitted.

## What Changes

### 1. Vendor agmsg scripts under `vendor/agmsg/`

- Add fujibee/agmsg as a **git submodule** at
  `vendor/agmsg/` pinned to a specific release tag. Rationale:
  single source of truth; no build-time network fetch; upstream
  updates land via `git submodule update`.
- Alternative considered: build-time `curl` fetch. Rejected because
  it fails in offline / air-gapped environments and requires the CI
  runner to have network access.
- The vendored tree ships agmsg's `scripts/`, `plugin/` (if any),
  and `LICENSE`; NOT its `db/` (that's runtime state).

### 2. Electron `extraResources` include the vendored dir

- Add an entry to `electron/package.json`'s `build.extraResources`:

  ```json
  {
    "from": "../vendor/agmsg",
    "to": "app/vendor/agmsg"
  }
  ```

- After packaging, the app's `resources/app/vendor/agmsg/` contains
  the full agmsg tree.

### 3. First-launch auto-install (with user consent)

- In `electron/src/main.ts`, after `app.whenReady()` and before
  `createWindowForProject`, run an `ensureAgmsgInstalled()` step.
- Behavior:
  1. If `~/.agents/skills/agmsg/scripts/send.sh` already exists →
     no-op (user has installed it themselves, or a previous first-
     launch already ran).
  2. Otherwise, show an Electron dialog:

     ```
     Install agmsg?

     ithyno uses agmsg to run multiple AI agents in parallel tmux
     panes. It requires ~1 MB of shell scripts installed at
     ~/.agents/skills/agmsg/.

     [Install]  [Skip]  [Never ask]
     ```

     - **Install** → copy `<electron-resources>/app/vendor/agmsg/`
       to `~/.agents/skills/agmsg/`, log to the app's stdout, keep
       going.
     - **Skip** → don't install this launch; ask again next time.
     - **Never ask** → write `~/.ithyno-config/skip-agmsg-install`
       marker; skip on subsequent launches too.

- The install path is user-config, not app-installed. If the user
  later runs `/plugin marketplace add fujibee/agmsg`, the plugin
  marketplace's copy will overwrite this. That's fine — both source
  the same MIT scripts.

### 4. What this change does NOT touch

- **No dispatcher skill change**. The existing "presence check on
  `~/.agents/skills/agmsg/scripts/send.sh`" logic (from P2b/c) works
  identically whether the file arrived via ithyno's bundle or via
  the Claude plugin marketplace. No skill rewrite needed.
- **No `agmsg` binary shim**. We ship the scripts to their canonical
  location; we do NOT modify `PATH` or install a wrapper CLI.
- **No CLI (`bin/ithyno.js`) auto-install**. CLI users are outside
  this change's scope; they see today's behavior (must install
  agmsg manually).
- **No tmux bundling**. tmux stays system-provided (macOS/Linux
  ship it; brew install tmux hint remains in P2's fallback banner).
- **No Windows path change**. On Windows the Electron build still
  ships the vendored dir, but the first-launch install prompts
  will not appear (the whole tmux/agmsg path requires a POSIX
  shell). Windows users see the P2 fallback banner.

## Spec deltas (`dashboard` capability)

- **ADDED** `Electron First-Launch Auto-Installs Agmsg` — new
  requirement covering the vendored dir, the first-launch prompt,
  the three user choices, and the "never ask" marker.

## Impact

- **Affected specs**: `dashboard` — 1 ADDED
- **Affected files**:
  - `.gitmodules` (new; submodule declaration)
  - `vendor/agmsg/` (new; submodule at fujibee/agmsg pinned release)
  - `electron/package.json` (`extraResources` entry)
  - `electron/src/main.ts` (`ensureAgmsgInstalled()` step in
    `app.whenReady()` chain)
  - `electron/src/agmsg-installer.ts` (new; copy logic + dialog +
    marker check)
  - `README.md` (short note: "Electron auto-installs agmsg;
    CLI users install via `/plugin marketplace add fujibee/agmsg`")
- **Risk**:
  - Submodule pin drift — the pinned tag might age. Mitigation:
    check upstream release at each ithyno release; bump the pin
    in a small `bump-agmsg-vendor` change.
  - User's existing `~/.agents/skills/agmsg/` predates ithyno's
    install (e.g., a hand-modified fork). Mitigation: the "exists"
    check treats any presence of `send.sh` as "installed"; we
    never overwrite.
  - Dialog fatigue on repeat "Skip" — mitigated by the "Never ask"
    third button.
  - Air-gapped CI/CD — submodule init on first clone must succeed;
    document `git clone --recursive` in the contributor README.
- **Migration**: none for existing users. First-launch prompt only
  appears when `~/.agents/skills/agmsg/scripts/send.sh` is absent.
