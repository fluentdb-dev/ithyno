---
tags: [dashboard, electron, vscode-extension, open-project, onboarding]
execution: worktree
---

## Why

Today the dashboard's Open Project flow assumes the picked folder
already contains `openspec/`. If it doesn't, the app lands on a
dead-end "No OpenSpec project found" empty state — no button, no
guidance, no way to proceed without leaving the app and running
`openspec init` from a shell. Users repeatedly hit this when they
want to try ithyno against an existing repo.

We already have `add-init-http-endpoint` (POST /api/init) + the
`add-new-project-onboarding-window` flow that runs `openspec init`
against a chosen folder. Users would be better served if Open
Project reused that plumbing instead of dead-ending.

Three-branch decision is the intent: when the user picks a folder
that isn't openspec-initialized yet, the dashboard offers:

1. **Initialize openspec here** — runs `openspec init` in place,
   then loads the newly-created project.
2. **Cancel** — dismisses and returns to the previous project (or
   the picker).
3. **Browse read-only** — opens the folder in a read-only view: the
   dashboard scans `docs/`, `README.md`, `CLAUDE.md`, and any other
   root-level markdown, and renders them under a lightweight
   navigation. No editing, no agent dispatch, no Kanban — just
   markdown. Useful for previewing a repo before committing to
   initialize openspec there.

Import + spec-generation is a **separate change**
(`import-project-spec-generation`, coming next) — this change only
adds the 3-branch decision UI + the read-only browse mode; the
spec-generation path is a future button inside the browse view.

## What Changes

- **`web/src/App.tsx`** — when the store's `state` reports
  `exists === false` for the current project, replace the current
  static "No OpenSpec project found" copy with a 3-button decision
  panel:
  - `Initialize openspec here` → POST /api/init (existing endpoint
    from `add-init-http-endpoint`) + optimistic reload
  - `Cancel` → set state to `null`, prompt user to pick another
    folder (Electron: re-open File dialog; browser: instruct user
    to relaunch with `--dir`)
  - `Browse read-only` → set a new store field `browseMode = true`
    and render `<ReadOnlyBrowse />`
- **New `web/src/components/ReadOnlyBrowse.tsx`** — enumerate
  markdown files (`README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/**/*.md`)
  and render a sidebar tree + right-pane markdown viewer. Reuses
  `SpecView.tsx`'s markdown renderer (react-markdown + remark-gfm).
- **New endpoint `GET /api/browse/markdown-tree`** — returns a JSON
  tree of markdown files under the project root, capped at N files
  and M levels deep. Server-side scan (fs.readdir recursive) with
  a bounded output. Only fires when `browseMode` is active.
- **New endpoint `GET /api/browse/markdown?path=<rel>`** — returns
  the raw content of a single markdown file. Path is validated to
  stay within the project root (no `..` escape).
- **Electron File menu**: no new menu item. `Open Project…` stays;
  the empty-state decision is UI-only.
- **CLAUDE.md-aware suggestion**: if `CLAUDE.md` exists at the
  project root, surface a small hint on the 3-button panel:
  "This project has CLAUDE.md — ithyno will pick it up as
  agent-facing context once openspec is initialized."

## Success

- Open Project on a folder that lacks `openspec/`:
  - The dashboard renders the 3-branch decision panel with three
    clear actions.
  - Clicking `Initialize openspec here` runs `openspec init` on the
    folder, reloads state, and shows the fresh Kanban.
  - Clicking `Cancel` returns the user to the previous project (if
    any) or the picker.
  - Clicking `Browse read-only` mounts `<ReadOnlyBrowse />` with a
    sidebar listing every markdown file under the root (docs/,
    README, CLAUDE.md, CONTRIBUTING, etc.) and a right-pane viewer.
- Open Project on a folder that has `openspec/`: behavior
  unchanged.
- `Browse read-only` mode does NOT:
  - Show the Kanban / Specs / Archive / Agents / Docs / Settings
    tabs
  - Auto-launch the terminal
  - Allow any /api/init, /api/change, or agent-dispatch calls
  - Access files outside the project root (path traversal denied)
- CLAUDE.md hint appears in the decision panel when the file
  exists at root.
