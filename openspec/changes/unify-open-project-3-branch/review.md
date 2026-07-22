---
verdict: needs-rework
reviewer: manager-fallback
model: sonnet
change_id: unify-open-project-3-branch
---

# Review

## Findings

### Finding 1 (severity: critical)
**File**: `server/browse.ts:206`
**Issue**: Symlink escape not blocked — `path.resolve()` is a pure string normalization function and does **not** follow symbolic links on the filesystem. The `isSymbolicLink()` guard (lines 203–212) calls `const realAbs = resolve(joined)` and then checks whether the result is inside the project root, but `resolve(joined)` simply returns `joined` unchanged (since it contains no `..` segments), so the check always passes for a symlink named like a normal file. A local user who can plant a symlink inside the project root (e.g. `project/escape.md -> /etc/passwd`) can retrieve the target via `GET /api/browse/markdown?path=escape.md` — the path-traversal gate does not fire, the 5 MB size cap is applied, and the file contents are returned as `{ content: "…" }`.

**Proof**: `path.resolve('/project/escape.md') === '/project/escape.md'` regardless of whether `escape.md` is a symlink to `/etc/passwd`. `fs.realpath('/project/escape.md')` correctly returns the real target path.

**Fix**: Replace `const realAbs = resolve(joined)` (line 206) with `const { realpath } = await import("node:fs/promises"); const realAbs = await realpath(joined)`. The async `fs.promises.realpath` follows all symlinks in the chain; the subsequent `relative(realRoot, realAbs)` check will then correctly detect escapes. The `realRoot` computation (`const realRoot = resolve(projectRoot)`) also needs the same treatment if `PROJECT_ROOT` itself is ever a symlink; for safety replace it with `await realpath(projectRoot)` as well.

---

### Finding 2 (severity: major)
**File**: `server/index.ts:333–358`
**Issue**: `GET /api/browse/markdown?path=<rel>` does not enforce a `.md` / `.markdown` extension. `resolveSafePath` only validates that the path stays within the project root; it does not restrict file types. Any file within the project root is readable — `agents.yaml`, `package.json`, `.env`, source files, binary configs. The tree endpoint correctly enumerates only markdown files, so this path requires the client to know (or guess) a non-markdown filename, but once known it is trivially accessible to any holder of the session token.

For contrast, `server/parser/docs.ts` (lines 38, 93, 116) explicitly checks `ent.name.endsWith(".md")` and `abs.endsWith(".md")` before serving any file.

**Fix**: Add an extension check immediately after `resolveSafePath` succeeds:
```typescript
if (!resolved.abs.endsWith(".md") && !resolved.abs.endsWith(".markdown")) {
  return reply.code(400).send({ error: "only markdown files may be read" });
}
```

---

### Finding 3 (severity: minor)
**File**: `server/browse.test.ts`
**Issue**: No test covers the symlink-escape case. The test file covers `..` traversal and absolute paths, but the specific attack path (symlink inside root pointing outside) has no test. Given that the current symlink check is broken (Finding 1), a regression test is needed to keep the fix honest.

**Fix**: Add a test in `describe("resolveSafePath")` that:
1. Creates a temp directory as the project root.
2. Creates a file *outside* the root.
3. Creates a symlink inside the root pointing to that external file.
4. Asserts `resolveSafePath(root, "escape.md")` returns `{ ok: false }`.

---

### Finding 4 (severity: minor)
**File**: `web/src/store.ts:485–486`, `web/src/App.tsx:207–212`
**Issue**: `browseMode` is not cleared when the workspace transitions from `exists === false` to `exists === true` via a `state-replaced` WebSocket event (e.g., another process runs `openspec init` externally while the user is in browse mode). The `state-replaced` handler calls `load()`, which updates `state.exists` to `true`, but `browseMode` remains `true`. App.tsx checks `if (browseMode && !authExpired)` before the `state?.exists` route guard, so the user is stuck in the browse UI even though a full project is now available. They must manually click "Back to decision" and then the dashboard never shows the decision panel (because `state.exists === true`), leaving them in a dead UI state unless they reload.

**Fix**: In the `state-replaced` WS handler (or in `load()` after the state is set), clear `browseMode` when the newly-loaded state has `exists === true`:
```typescript
} else if (msg.type === "state-replaced") {
  void get().load().then(() => {
    if (get().state?.exists) get().setBrowseMode(false);
  });
```
Or equivalently, add `if (state.exists) set({ browseMode: false })` inside `load()` after `set({ state, … })`.

---

### Finding 5 (severity: info)
**File**: `web/src/components/ReadOnlyBrowse.tsx:213`
**Issue**: XSS risk is **not present** in the current implementation. `react-markdown` v10 (used here) escapes raw HTML by default — inline `<script>` tags and `javascript:` links in the markdown content are neutralized without requiring `rehype-raw` or `allowDangerousHtml`. This is consistent with how `Docs.tsx` and `ChangeDetail.tsx` already use `ReactMarkdown`. No action needed.

---

### Finding 6 (severity: info)
**File**: `electron/src/preload.ts:15–29`
**Issue**: `ithyno.openProject` is correctly exposed via `contextBridge.exposeInMainWorld` with `contextIsolation: true` and `nodeIntegration: false` (confirmed in `main.ts:246–249`). The preload only calls `ipcRenderer.send(IPC_OPEN_PROJECT)` with no arguments — it cannot pass attacker-controlled data to main. The main-side handler (`ipcMain.on(IPC_OPEN_PROJECT, …)`) calls `pickProjectDialog()` which is a native OS file picker — no renderer-supplied path is trusted. This is correct Electron security practice.

---

### Finding 7 (severity: info)
**File**: `server/parser/workspace.ts:137,140,156`
**Issue**: `hasClaudeMd` is computed correctly in both branches of `scanWorkspace`. When `openspecDir` is null (no openspec found), `existsSync(join(projectRoot, "CLAUDE.md"))` is evaluated against the project root. When `openspecDir` is non-null, the same `projectRoot` (not `openspecDir`) is used. The field is included in both return paths. No issue found.

---

### Finding 8 (severity: info)
**File**: `server/browse.ts:31–38`, `server/browse.ts:117–119`
**Issue**: Tree scan bounds are correctly applied: `SKIP_DIRS` (node_modules, .git, .worktrees, dist, build, coverage) are skipped, hidden directories (`.name.startsWith(".")`) are skipped, depth is capped at 5 levels, and file count is capped at 500. No action needed.

---

## Verdict

needs-rework — two blocking issues must be fixed before ship:

1. **Critical (Finding 1)**: Symlink escape via `path.resolve()` — must be replaced with `fs.promises.realpath()` so symlinks are actually followed before the bounds check.
2. **Major (Finding 2)**: Non-markdown files are readable via `/api/browse/markdown` — add a `.md`/`.markdown` extension guard to match the existing behavior in `docs.ts`.

Finding 3 (missing symlink test) and Finding 4 (browseMode stuck after external init) should also be addressed in the same rework pass. Findings 5–8 are informational only and require no changes.
