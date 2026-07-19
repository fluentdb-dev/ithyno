---
tags: [feature/git, feature/ui, area/server, area/web]
---

## Why

The dashboard already lets users set `user.name` / `user.email`
via the `GitIdentityChip` / `GitIdentityModal` pair, but there is
no UI for `remote.origin.url`. Two friction points:

- After `git init` (or opening a freshly cloned starter repo with
  no remote), the user has no in-app path to connect the tree to
  a GitHub repository. They must drop to a shell and run
  `git remote add origin <url>`.
- When cloning ithyno-style example projects that ship with a
  placeholder `origin`, users occasionally want to swap it for
  their own fork. Again, requires shell.

Both are small but they interrupt the "stay in the dashboard"
loop that other init/identity flows already deliver.

## What Changes

- **Extend `GitIdentityModal`** with a new "Remote origin" section
  below the name/email fields. Shows current
  `git config remote.origin.url` (or "none").
- **Input + Save** button that runs the correct git plumbing:
  - No origin set → `git remote add origin <url>`
  - Origin already set → `git remote set-url origin <url>`
- **Server API** additions:
  - `GET /api/git/remote` — returns `{ url: string | null }`
  - `POST /api/git/remote` — body `{ url: string }`, CSRF-guarded,
    performs add-or-set based on current state
- **Chip surface**: `GitIdentityChip` shows a small "no origin"
  hint dot when the remote is missing (in the same visual style
  as the existing "identity missing" hint), so the user knows to
  open the modal.
- **Validation**: URL must match one of `https://…`, `git@…:…`,
  `ssh://…`, or `http://…` (basic surface check, no reachability
  probe). Empty input keeps the current value; explicit clearing
  is NOT part of v1 (see Out of scope).
- **Toast** on success / failure, mirroring the existing identity
  save flow.

## Capabilities

### Modified Capabilities

- `dashboard`: the git-identity panel gains a remote-origin
  section; the identity chip surfaces a "no origin" hint.

## Impact

- `server/git/remote.ts` (new) — `readOriginUrl(repoRoot)` and
  `writeOriginUrl(repoRoot, url)` (add-or-set semantics)
- `server/index.ts` — the two API routes
- `web/src/components/GitIdentityModal.tsx` — remote section +
  save handler
- `web/src/components/GitIdentityChip.tsx` — "no origin" hint dot
- `web/src/store.ts` — `remoteOriginUrl` slice + load / save
  actions

## Out of scope

- **Removing the origin** (`git remote remove origin`). Rare;
  can be added later if requested. Users can still clear via
  shell.
- **Multiple remotes** (upstream, fork, etc.). One `origin` is
  the 99% case in this dashboard's workflow.
- **SSH key management / auth flows.** The dashboard doesn't
  authenticate on the user's behalf; the URL is set, the
  underlying git push/pull still uses the user's own credentials.
- **Reachability probe** on save (e.g. `git ls-remote`). Would
  add latency and error paths without proving anything the next
  push wouldn't surface.
- **Push / pull / fetch buttons in the dashboard.** Distinct
  scope; the terminal handles it today.
