## Context

OpenSpec UI's happy path assumes the project is already a git repository
with a sensible `user.name` / `user.email`. That assumption fails for two
real cases we hit while dogfooding:

- Fresh projects where the user is evaluating the dashboard before
  running `git init`.
- Machines where `--global` git identity is missing or misconfigured
  (e.g. a shared workstation, a fresh VM).

Both cases surface downstream: `git worktree add` errors with a raw
git message; commits made from the embedded terminal or by agents inherit
whatever chain resolves. There is no dashboard signal in either direction.

This change lands a minimal dashboard-side surface: **repository state
detection + local identity read/write + initialize-repo**, plus a
header-level chip that makes the state visible at all times.

## Goals / Non-Goals

**Goals:**
- Always-visible dashboard signal of the workspace's git state
- Editable local identity (`--local user.name` / `--local user.email`)
- One-click `git init` from the modal when no repo exists
- Feed `gitStatus.isRepo` into the ExecutionPicker so Worktree mode is
  disabled with a clear reason when init is required
- All mutating endpoints go through the existing auth + CSRF gate
- Localhost-only enforcement matches the rest of the mutating surface

**Non-Goals:**
- Editing `--global` from the dashboard (see rationale below)
- Branch / commit / remote / stash operations
- Diff / status views (already covered by `add-diff-viewer` for agent
  jobs; a workspace-level diff panel is a separate change)
- SSH keys, credential helpers, GPG signing
- GitHub / GitLab / Bitbucket account linkage
- Avatar image sourcing (Gravatar / hosting profile). Initials only.
- Multi-repo workspaces / submodules

## Decisions

### Shell scope: local + Electron only

The header chip and identity modal live on the **local-server** and
**Electron** shells. The **VS Code extension** shell explicitly does not
mount them.

Rationale:
- VS Code's Source Control panel already exposes `user.name` /
  `user.email` editing and an `Initialize Repository` action. Duplicating
  that in our chip creates two sources of truth from the user's point of
  view — "which one takes effect if they disagree?" — even though they
  hit the same `git config` under the hood.
- The chip is one of very few pieces of dashboard chrome that has a
  natural, pre-existing home in the host IDE. Following the same
  philosophy that led us to delegate the embedded terminal to VS Code's
  terminal panel (see `add-vscode-extension`), we defer the identity
  surface too.
- Local-server and Electron shells have no equivalent affordance, so the
  chip earns its keep there.

Detection uses the same runtime signal introduced by
`add-vscode-extension`: `typeof acquireVsCodeApi === "function"` in the
webview. The chip's mount and the picker's reason text branch on that.

The server endpoints (`GET /api/git/status`, `GET /api/git/config`,
`POST /api/git/config`, `POST /api/git/init`) exist unconditionally. They
are safe to leave callable from the VS Code webview — nothing bad
happens if VS Code calls them — but the VS Code UI simply does not.

### Detection: `.git` presence vs. `git rev-parse`

Use both. `.git` folder existence is a fast synchronous check for the
common case; `git rev-parse --is-inside-work-tree` is the authoritative
answer that handles the edge cases (`.git` as a file pointing to a
worktree, bare-repo submodules). Use `.git` for the fast path in
`getState()` and let a follow-up `rev-parse` in `GET /api/git/status`
correct it.

### Effective vs. local identity

`git config user.email` returns the resolved chain (local > global >
system). The modal must show:

- **Effective** — what commits made *now* would use
- **Local** — what `--local` currently holds (if anything)

Editing writes `--local` only. If the field is cleared, the local entry
is unset (`git config --local --unset`) so the effective chain falls
back to global.

Query strategy: use `git config --show-scope --get user.name` which
returns `<scope>\t<value>` in a single call per key, avoiding two
round-trips per field.

### Not touching `--global`

Every dashboard mutation is scoped to the project. Writing `--global`
from a per-project dashboard is a surprise vector — someone dogfooding
in one repo could silently change identity for every repo on the
machine. Users who want a fallback identity should set it once outside
the dashboard.

### `git init` behavior

- Run in the project root only (never in a nested subdirectory).
- Refuse if already inside a git repository (report as ok / no-op).
- Do **not** create an initial commit. That's a decision users often
  make deliberately (branch name, gitignore state); leave it to them.
- Emit `git-status-updated` on success so the header + picker update.

### Localhost + auth

`GET /api/git/status` and `GET /api/git/config` are open (same as other
GET endpoints) but require localhost. `POST /api/git/config` and
`POST /api/git/init` require the session token + Origin allow-list, same
as every other mutating call.

### UI: header chip placement

The chip lives in the top-right of the app header, next to the existing
theme/settings controls. It shows initials (up to 2 chars) computed from
`user.name` when set, or a neutral SVG icon when unset. A red dot at the
top-right of the chip indicates `!isRepo`. Hovering the chip shows the
tooltip `"<user.name> <user.email>"` or `"No git identity configured"`.

### UI: modal states

Two distinct visual states:

1. **Not a git repository** — prominent CTA button `"Initialize
   repository"`. The identity fields are visible but disabled with a
   hint `"Initialize the repository first."`. Cancels the modal.
2. **Git repository** — repo root path (readonly), current branch
   (readonly), two editable fields with placeholders showing the
   effective value and a `Source: local / global / system / unset`
   sublabel. Save button, greyed out until a field changes.

State transitions happen live via the `git-status-updated` WS event.

### Refresh strategy

- On mount: read from `state.gitStatus` (already in the initial payload).
- On WS `git-status-updated`: update store.
- On modal open: also refresh via `GET /api/git/config` to get the local
  scope details (which aren't part of `/api/state`).
- No polling.

### What if the `git` binary is missing?

Unlikely but possible on locked-down machines. If any of the git shells
throw `ENOENT`, treat it as `isRepo: false` and surface the reason in
the modal (`"git binary not found in PATH"`), disabling init.

### Broadcast event kind

Add `git-status-updated` to the existing WS event union used by the
watcher / agent runner. Payload: `{ isRepo, root?, headBranch? }` — the
same shape as `/api/git/status`.

## Alternatives considered

- **Poll `/api/git/status` from the client** instead of WS event.
  Rejected: adds noise, misses the "another tab initialized" case.
- **Show a permanent banner instead of a chip.** Rejected: banner noise
  competes with `add-csrf-protection`'s auth-expired banner; a chip
  respects the user's attention when the identity is set.
- **Include current branch in the header chip.** Rejected for v1:
  branch churn from agents would repaint the header constantly; better
  suited for a dedicated status panel.
- **Bundle this into `add-init-command`.** Rejected: that change is CLI-
  side scaffolding (`openspec-ui init`) with different lifecycle,
  templates, and packaging concerns. Different code paths, different
  reviewers, different tests. Keep separate.
- **Mount the chip in the VS Code shell too, sourced from VS Code's
  SCM API instead of our endpoints.** Rejected. VS Code's own Source
  Control panel is right there — a chip in our webview would compete
  with it for attention and split the mental model. Users of the VS
  Code shell use VS Code's git integration; users of the browser /
  Electron shell use ours.
