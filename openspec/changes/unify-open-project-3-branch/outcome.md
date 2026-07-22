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

---

## Rework round 2

Addressed all blocking and minor issues raised by the review pass.

### Fixes applied

**Critical (Finding 1) — symlink escape via `path.resolve()`**
Replaced `resolve(joined)` in `resolveSafePath` with `await realpath(joined)`.
`path.resolve()` is pure string normalization and does not follow symlinks on
the filesystem; `fs.promises.realpath()` does. Additionally, `realpath` is now
used for the project root itself (`await realpath(projectRoot)`) so the
containment check works even when `PROJECT_ROOT` is itself a symlink (as is
common on macOS where `/var` → `/private/var`). The string-level pre-check is
still done with `resolve()` so paths to non-existent files still get the `..`
guard without requiring I/O.

**Major (Finding 2) — no extension guard on `/api/browse/markdown`**
Added an explicit `.md` / `.markdown` extension check in `server/index.ts`
immediately after `resolveSafePath` succeeds. Any other file extension now
returns 400 `"only markdown files may be read"`, consistent with
`server/parser/docs.ts` which already enforces `.md`-only reads.

**Minor (Finding 3) — missing symlink regression test**
Added a test case in `server/browse.test.ts` `describe("resolveSafePath")`:
creates a temp directory as project root, writes a file outside the root,
plants a symlink inside the root pointing to it, and asserts `ok: false`.
The new symlink test passes and joins the 14 existing browse tests.

**Minor (Finding 4) — `browseMode` stuck after external `openspec init`**
In `web/src/store.ts`, the `state-replaced` WebSocket handler now chains a
`.then()` on `get().load()` that calls `get().setBrowseMode(false)` when the
freshly-loaded state has `exists === true`. This ensures that if another
process creates `openspec/` out-of-band while the user is in browse mode,
the dashboard transitions cleanly instead of leaving the user stranded in
the read-only browse UI.

### Sanity checks

- `openspec validate unify-open-project-3-branch --strict` → VALID
- `npm test` → 369 passed / 1 skipped / 1 pre-existing failure
  (the `scripts/build-icons.test.mjs` failure is a pre-existing environment
  issue — the `sharp` native package is not installed in this worktree;
  confirmed by `npm ls sharp` returning empty; unrelated to this change)
- `npm run typecheck` → clean (also removed now-unused `stat` import from
  `browse.ts` that was left from the original symlink guard)
- `npm run build` → clean Vite production build, 830 kB bundle
