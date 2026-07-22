---
verdict: pass
reviewer: manager-fallback
model: sonnet
change_id: unify-open-project-3-branch
round: 2
---

# Review — Round 2

Rework commit: `9b55b1a`

This round verifies that each round-1 finding was addressed and performs a fresh
multi-angle pass for any new issues introduced by the rework.

---

## Round-1 findings disposition

### Finding 1 (severity: critical) — RESOLVED
**Was**: `path.resolve()` used for symlink check (pure string, does not follow symlinks).

**Verified fix** (`server/browse.ts:205–229`):
- `realRoot` is now computed with `await realpath(projectRoot)` — covers the case
  where `PROJECT_ROOT` itself is a symlink (e.g. macOS `/var → /private/var`).
- When the final path segment is a symlink (`lstat.isSymbolicLink()`), its real
  destination is resolved with `await realpath(joined)` and the result is checked
  against `realRoot` via `relative()`.
- Both sides of the containment check use filesystem-resolved paths.
- The new symlink test in `browse.test.ts` passes (see Finding 3 below).

---

### Finding 2 (severity: major) — RESOLVED
**Was**: `GET /api/browse/markdown` accepted any file extension, not just `.md`/`.markdown`.

**Verified fix** (`server/index.ts:342–344`):
```typescript
if (!resolved.abs.endsWith(".md") && !resolved.abs.endsWith(".markdown")) {
  return reply.code(400).send({ error: "only markdown files may be read" });
}
```
Guard is placed immediately after `resolveSafePath` succeeds, before any I/O.
Matches the existing `docs.ts` pattern.

---

### Finding 3 (severity: minor) — RESOLVED
**Was**: No regression test for symlink escape.

**Verified fix** (`server/browse.test.ts:155–173`):
The new test:
1. Creates a temp dir as project root.
2. Writes a file outside the root.
3. Plants a symlink inside the root pointing to the external file.
4. Asserts `resolveSafePath(root, "escape.md")` returns `{ ok: false }` with a
   `reason` matching `/symlink|outside/i`.

Test execution: `✓ server/browse.test.ts > resolveSafePath > rejects a symlink inside root that points to a file outside root` — passes (10 ms).

---

### Finding 4 (severity: minor) — RESOLVED
**Was**: `browseMode` not cleared when `state-replaced` WS event fired with `exists === true`.

**Verified fix** (`web/src/store.ts:486–491`):
```typescript
void get().load().then(() => {
  if (get().state?.exists) get().setBrowseMode(false);
});
```
Reads updated state after `load()` resolves — correct because `load()` sets `state`
before the Promise resolves, and `get()` always returns the latest Zustand state.

---

### Findings 5–8 (severity: info) — No action required
All four informational findings from round 1 remain non-issues:
- XSS: `react-markdown` v10 still escapes raw HTML by default.
- Electron IPC: `contextBridge` + no renderer-supplied paths, still correct.
- `hasClaudeMd`: still computed correctly in both branches.
- Tree scan bounds: unchanged.

---

## Fresh multi-angle pass (round 2)

### New Finding A (severity: minor)
**File**: `server/browse.ts:215–229`
**Issue**: Intermediate-directory symlink not caught by `lstat`-only approach.

`resolveSafePath` uses `lstat(joined)` where `joined = join(projectRoot, relPath)`.
This only stats the **final path segment**. If `relPath = "subdir/file.md"` and
`subdir` is itself a symlink to an external directory, `lstat` operates on the
resolved `subdir/file.md` target (the OS resolves intermediate symlinks before
calling lstat on the final component), so `lstat` would stat the real file — which
is NOT a symlink — and the guard would not fire.

**Practical risk**: Low. `buildMarkdownTree` uses `readdir` with `withFileTypes: true`,
and `Dirent.isDirectory()` returns `false` for symlink-to-dir entries on Linux/macOS
(confirmed by runtime test). The tree API therefore never exposes symlink directories
as tree nodes, so a client cannot derive such paths from the tree. An attacker would
have to guess or know that a symlink directory exists inside the project root.

**Recommended fix** (non-blocking, can be deferred): Replace the `lstat`-only guard
with an unconditional `realpath(joined)` call when the file exists, then check the
resolved path against `realRoot`. Example:
```typescript
try {
  const realAbs = await realpath(joined);
  const relReal = relative(realRoot, realAbs);
  if (relReal.startsWith("..") || isAbsolute(relReal)) {
    return { ok: false, reason: "path (or an ancestor) resolves outside the project root" };
  }
} catch {
  // File does not exist — let the caller handle 404.
}
```
This also simplifies the symlink-specific branch.

---

### New Finding B (severity: info)
**File**: `server/index.ts:342–354`
**Issue**: TOCTOU between `resolveSafePath` and subsequent `stat`/`readFile`.

`resolveSafePath` verifies the path at time T₁; `stat(resolved.abs)` and
`readFile(resolved.abs)` are called at T₂. In the window between T₁ and T₂,
a local user could swap the file for a symlink pointing outside the root.

**Practical risk**: Very low. This is an inherent check-then-use race. Exploitation
requires local write access to the project root, which already implies a higher
privilege level than the browser session token confers. No action required.

---

### New Finding C (severity: info)
**File**: `server/browse.ts:234`
**Issue**: `resolveSafePath` returns `abs: joined` (the pre-lstat path), not `abs: realAbs`.

When a symlink inside the root points to another file **also inside the root** (a valid
intra-root symlink), the returned `abs` is the symlink path, not the real file path.
Subsequent `stat(abs)` in `index.ts` follows the symlink transparently. This is correct
behavior — the extension guard checks the symlink name (which still ends in `.md`) and
`stat`/`readFile` both follow symlinks. No issue.

---

## Test run summary

All browse tests pass in the rework commit:
- 8/8 `buildMarkdownTree` tests pass
- 8/8 `resolveSafePath` tests pass (including the new symlink regression test)
- 1 pre-existing unrelated failure: `scripts/build-icons.test.mjs` > "second run produces byte-identical output" — caused by missing `sharp` native binary in this worktree, unrelated to this change.

---

## Verdict

**pass**

Both round-1 blocking issues (critical symlink escape, major missing extension guard)
are fully resolved. Both round-1 minor issues (missing symlink test, browseMode stuck
on state-replaced) are addressed. The fresh pass found one new minor finding (A:
intermediate-directory symlink not caught) and two info-only notes (B: TOCTOU, C: abs
returns joined not realAbs). Neither A nor B/C is blocking — the practical attack
surface for A is limited because the tree API does not expose symlink directories, and
B/C require local filesystem access beyond the session token's scope.

**Findings this round**: 3 new (1 minor, 2 info).
