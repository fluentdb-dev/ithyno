---
tags: [feature/git, area/server, area/web]
---

## Why

Two gaps surfaced during the 2026-07-01 dogfood pass:

1. **Silent worktree failure when the project is not a git repository.**
   Clicking Kanban's Start button (worktree mode) fails with `fatal: not a
   git repository` after the fact. The dashboard has no signal beforehand
   that git worktree operations are unavailable, and no path to fix it
   without dropping to a terminal.
2. **Git identity is invisible from the dashboard.** When agents commit on
   behalf of the user (via worktree spawn) or when the user commits from
   the embedded terminal, the `user.name` / `user.email` in force is
   whatever git config chain resolves — invisible from the UI, silently
   inherited from `--global`. This is a footgun for users who share a
   machine or want per-project identities.

Both problems point at the same missing capability: **the dashboard needs
first-class visibility and control over the workspace's git state.** This
change lands the minimum viable surface — repo detection, identity display,
local identity editing, and initialize-repo — and leaves branch / remote /
commit UX for later.

## What Changes

- **Header chip (top-right)** shows the effective git identity — **only in
  the local-server and Electron shells**. Circle avatar with initials from
  `user.name` (or a neutral icon if unset). Small text: `user.name`, or
  `"Configure git…"` when nothing is set. A warning dot marks the "not a
  git repository" state. In the VS Code extension shell the chip is not
  mounted (see below).
- **Click the chip → Git identity modal.** The modal has two states:
  - **Not a git repository**: primary CTA `"Initialize repository"`. The
    identity fields are disabled with a hint until initialization succeeds.
  - **Git repository**: shows the repo root and current branch; two
    editable fields (`user.name`, `user.email`) with placeholders reflecting
    the effective value; a per-field "Source: local / global / system /
    unset" line so the user knows what will change. Save writes
    `git config --local`.
- **ExecutionPicker** disables the Worktree option when the workspace is
  not a git repository. The reason text is shell-aware — `"Not a git
  repository — open the Git panel to initialize."` in local/Electron
  shells, and `"Not a git repository — initialize via VS Code's Source
  Control."` in the VS Code shell.
- **Server endpoints (all auth-gated by the existing CSRF token):**
  - `GET  /api/git/status` → `{ isRepo, root?, headBranch? }`
  - `GET  /api/git/config` → `{ effective, local }` (each `{ userName?, userEmail? }`)
  - `POST /api/git/config` `{ userName?, userEmail? }` → writes `--local`
  - `POST /api/git/init` → runs `git init` in the project root
- **WebSocket event `git-status-updated`** is emitted after a successful
  init or config write, so any open tab refreshes without polling.

The initial dashboard state fetch (`/api/state`) also includes the initial
`gitStatus` so the header chip and picker render correctly on first paint.

## Capabilities

### New Capabilities
- `git-identity`: workspace git repository detection, identity display,
  local identity editing, and repository initialization from the dashboard

### Modified Capabilities
<!-- none — the ExecutionPicker gate is a wiring change against
     ui-orchestration, not a spec-level change to it -->

## Impact

- **New module** `server/git/`:
  - `status.ts` — `.git` detection + `git rev-parse` for the branch
  - `config.ts` — read/write `user.name` / `user.email` (effective + local)
  - `init.ts` — invoke `git init` and re-detect status
- **`server/index.ts`**: four new routes; `getState()` now includes
  `gitStatus`; new WS event added to the broadcaster union.
- **`server/util/broadcaster.ts`** (or equivalent): new event kind.
- **`web/src/types.ts`**: `GitStatus`, `GitConfig` types; `WorkspaceState`
  gains `gitStatus`.
- **`web/src/api.ts`**: `getGitStatus`, `getGitConfig`, `setGitConfig`,
  `initGitRepo`.
- **`web/src/store.ts`**: track `gitStatus` from state / WS event.
- **`web/src/components/AppHeader.tsx`** (or the current header host):
  mount the chip.
- **New `web/src/components/GitIdentityChip.tsx`** and
  **`GitIdentityModal.tsx`**.
- **`web/src/components/Kanban.tsx`**: disable Worktree in ExecutionPicker
  when `!gitStatus.isRepo`; small edit only.
- **`web/src/styles.css`**: chip + modal styles.
- Tests: parser-style unit tests for `server/git/config.ts` (parsing the
  output of `git config --show-scope --get`), and one integration-style
  test that runs against a temp repo.

## Out of scope (follow-ups)

- **VS Code extension shell** (deliberate). VS Code already ships a
  first-class Source Control panel with user.name / user.email settings,
  branch controls, and an initialize-repository command. Layering our own
  git chip on top would duplicate that surface and confuse users about
  which one is authoritative. In the VS Code shell we defer to VS Code's
  own git integration; only the ExecutionPicker learns about
  `gitStatus.isRepo` (for the Worktree gate).
- Branch / remote / dirty-state display (a "git status" panel is a
  separate change).
- Commit / branch / remote **operations** from the UI.
- Global config editing. Deliberately excluded: mutating `--global`
  from a project dashboard is surprising. Users who want a fallback
  identity set it once outside the dashboard.
- SSH keys, credentials, GPG signing, hosting-account (GitHub) auth.
- Avatar image lookup (Gravatar / GitHub). Initials only in v1.
