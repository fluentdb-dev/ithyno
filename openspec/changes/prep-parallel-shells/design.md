## Context

The current root `package.json` has no `workspaces` field. Both
`add-electron-shell` and `add-vscode-extension` need to add their package as
a workspace. Both would also benefit from a `build:server` script that emits
JS to a packaging-friendly directory. Doing those edits in two parallel
worktrees produces a deterministic conflict on a single root file the
moment we attempt to merge.

This change pre-stages the changes so the conflict source no longer exists.

## Goals / Non-Goals

**Goals:**
- Land the workspaces array and the build:server script ahead of the
  parallel runs.
- Land `.gitignore` entries for both shells so neither worktree races to
  add them.
- A small architectural note so the relationship between the three
  upcoming changes is documented.

**Non-Goals:**
- Creating the `electron/` or `vscode-extension/` directories. The empty
  workspace entries are intentional; the directories arrive with their
  respective changes.
- Pre-populating any shell-specific scripts (e.g. `electron:dev`). Those
  belong to the change that brings their package.
- Adding `tsx` to the runtime path of the shells (they'll use the
  precompiled `server-dist/` output).

## Decisions

### Workspaces array

`["electron", "vscode-extension"]` — both names declared up-front. npm
prints a warning for an entry that points at a missing directory but the
install otherwise succeeds, and the warning disappears as soon as the
directory exists. We accept the transient warning to avoid the conflict.

### `build:server` script and `server-dist.tsconfig.json`

The existing root `tsconfig.json` is configured for `noEmit` because the
server runs through `tsx` in development. For packaging, the shell paths
need real JS output. We add a sibling `server-dist.tsconfig.json` that
extends the root config and overrides `noEmit: false` plus `outDir:
server-dist`. The `build:server` npm script invokes `tsc -p
server-dist.tsconfig.json`.

### gitignore

`server-dist/`, `electron/out/`, `electron/dist/`, `vscode-extension/out/`
are all build artifacts and never tracked.

### Architecture note

A short markdown file at `docs/architecture/parallel-shells.md` cross-links
this change with `add-electron-shell`, `add-vscode-extension`, and the
captured idea on folder layout. This becomes the breadcrumb future readers
can follow when wondering why the workspaces array is empty.

## Risks / Trade-offs

- **npm warning for empty workspaces.** Acceptable; it goes away with each
  shell's first commit.
- **`server-dist/` and `tsx` divergence.** The runtime and the precompiled
  output must stay in sync. Since `tsc` reads the same source as `tsx`, the
  divergence is bounded; integration tests on each shell's first
  packaging run will catch drift.
- **The change feels small enough to "just do".** Skipping the proposal
  would have been arguable. We propose it explicitly because it introduces
  a new capability (`build-system`) that downstream changes will reference
  by name.
