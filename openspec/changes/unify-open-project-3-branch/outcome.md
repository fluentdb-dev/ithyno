# Outcome: unify-open-project-3-branch

## What was implemented

Replaced the dead-end "No OpenSpec project found" empty-state with a
`<NoProjectDecisionPanel />` that offers three actions when a non-openspec
folder is opened:

1. **Initialize openspec here** — POSTs to the existing `/api/init` endpoint,
   then refetches `/api/state`. On success the dashboard transitions to the
   fresh Kanban view.
2. **Cancel** — In Electron, re-opens the File → Open Project dialog via a
   new `ithyno:open-project` IPC channel added to `preload.ts` and `main.ts`.
   In the browser, shows a helper telling the user to relaunch with `--dir`.
3. **Browse read-only** — Sets `browseMode: true` in the store, which causes
   `App.tsx` to render `<ReadOnlyBrowse />` instead of the normal chrome.

New server endpoints:
- `GET /api/browse/markdown-tree` — bounded scan (5 levels deep, 500 files)
  returning a JSON tree of markdown files under the project root.
- `GET /api/browse/markdown?path=<rel>` — returns file content after
  validating that the path stays within the project root (rejects `..`,
  absolute paths, symlink escapes).

Both endpoints work regardless of `openspec/` existence, which is the core
requirement.

`GET /api/state` now includes `hasClaudeMd: boolean` — when true the panel
shows a hint about agent context.

Terminal auto-launch is suppressed while `browseMode === true` via a
defensive guard in `App.tsx`'s `showTerminal` expression.

---

## ✅ Worked

- TypeScript types for browse endpoints were cleanly addable without breaking
  the existing model contracts.
- The `scanWorkspace` change to return `root: projectRoot` (instead of `""`)
  when `exists === false` was minimal and the only consumer of `state.root` in
  this state is the new panel, so no regression risk.
- The store slice (`browseMode` + `setBrowseMode`) followed the exact same
  pattern as the existing `terminalSize` slice — straightforward.
- The `Dirent` typing issue with newer TypeScript (5.9) was resolved by using
  `unknown as Promise<Dirent[]>` cast on the `readdir` call, matching what
  TypeScript 5.9's stricter Dirent overload resolution requires.

## ⚠️ Surprises

- TypeScript 5.9 changed the `readdir` overload resolution: calling
  `readdir(dir, { withFileTypes: true })` with `strict` mode active now
  infers `Dirent<NonSharedBuffer>` instead of `Dirent<string>`, which caused
  many cascading type errors. A cast to `Dirent[]` was the cleanest fix
  without touching the rest of the codebase.
- The change artifacts (`proposal.md`, `tasks.md`, `specs/`) existed only in
  the main repo, not in the worktree's `openspec/changes/`. Had to copy them
  in before `openspec validate` could run.
- The Electron IPC bridge had `onTerminalRestart` but no renderer→main
  "trigger open project dialog" channel. Added `ithyno:open-project` IPC to
  `preload.ts` (exposed as `window.ithyno.openProject()`) and registered the
  handler in `main.ts`.

## 🔁 Differently

- Instead of checking `state.root` to extract the project root path in the
  `!exists` case, could have added a dedicated `projectRoot` field to
  `WorkspaceState`. Chose to reuse `root` (returning the projectRoot instead
  of `""` when `exists === false`) to keep the type shape minimal.
- The `NoProjectDecisionPanel` directly `fetch`es `/api/init` rather than
  going through an `api.ts` helper. In hindsight, a helper like
  `initProject(dir)` in `api.ts` would keep the auth header logic in one
  place.

## 🌱 Follow-ups

- **Browse non-markdown files**: Consider extending Browse mode to show
  source-code files (`.ts`, `.py`, `.go`, etc.) in a syntax-highlighted code
  pane — useful for exploring a repo before deciding to initialize openspec.
- **"Generate spec from this" button**: A future button inside Browse mode
  (per `import-project-spec-generation`) that hands off to the spec-generation
  pipeline. The Browse pane is now the natural entry point for this flow.
- **`.gitignore` respect in the tree scan**: The current scan hard-codes a
  `SKIP_DIRS` set. A future improvement would read `.gitignore` and apply
  `ignore` patterns to further reduce noise (e.g. compiled artifacts not in
  the standard skip list).
- **Electron "Cancel" feedback**: Currently Cancel in Electron immediately
  invokes the dialog. A brief confirmation or "returning to project picker"
  toast might improve perceived responsiveness.
