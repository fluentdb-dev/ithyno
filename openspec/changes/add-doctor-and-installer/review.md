---
round: 2
verdict: pass
reviewed_commit: a6680b7
base_review_commit: 0878926
findings: []
---

# Review: add-doctor-and-installer (round 2)

Reviewed commit `a6680b7`. All six findings from round 1 are fixed (F6 was
info-only and required no action). No new issues found.

---

## F1 — FIXED: `whichProc?.kill()` inside `settle()`

`whichProc` is now declared as `let whichProc: ReturnType<typeof spawn> | undefined`
before `settle()` is defined, then assigned after `spawn(...)`. `settle()` calls
`try { whichProc?.kill(); } catch { /* ignore */ }` before resolving — the
optional-chaining handles the window between declaration and first assignment,
and calling `.kill()` on an already-exited process is a safe no-op. Process
reference leak is closed.

---

## F2 — FIXED: `cpSync` now uses `force: true`

`cpSync(vendorRoot, TARGET_ROOT, { recursive: true, force: true })` with an
inline comment explaining the rationale. A partial prior install will now be
fully overwritten. The regression test in `doctor.test.ts` explicitly verifies
that stale files are replaced.

---

## F3 — FIXED: `antigravity` excluded from `AGENT_KEYS`

`AGENT_KEYS` is now `["claude", "codex", "agy", "copilot", "gemini", "opencode",
"cursor"]` — `antigravity` removed. The comment explains it is an alias for
`agy` and including it would double-count the same installation. Code and
comment are now consistent.

---

## F4 — FIXED: Windows limitation commented at spawn site

The spawn call now has a comment immediately above it:

> Note: `which` is not available on Windows (the equivalent is `where`).
> The error handler below silently ignores ENOENT, so `resolvedPath` remains
> undefined on Windows — only the path field in the report is affected.

Accurate and sufficient for a macOS/Linux-targeted feature.

---

## F5 — FIXED: `activeReader` hoisted and cancelled on unmount

`activeReader` is declared in the outer `useEffect` scope (line 448), assigned
to `reader` at line 466 — after the null-guard early return but before the
`reader.read()` loop begins. The cleanup function calls
`activeReader?.cancel().catch(() => {})`. If unmount races with the fetch
before `reader` is obtained, `activeReader` is `undefined` and the optional
chain is a safe no-op. All paths are covered correctly.

---

## F6 — INFO (no action required)

WS broadcast timing was correct in round 1 and unchanged.

---

## F7 — FIXED: new tests in `doctor.test.ts`

Two new `describe` blocks added:

1. **`install tool validation (logical)` — `400-path guard rejects every non-installable value`**:
   mirrors the exact `tool !== "tmux" && tool !== "agmsg"` guard from
   `server/index.ts`, exhaustively tests 15+ rejection cases and both accept
   cases. Covers the 400-path that had no tests.

2. **`agmsg install cpSync force:true (F2 regression)`**: two sub-tests using
   real `cpSync` calls on a temp directory — one verifying that stale files
   are overwritten with `force: true`, one documenting the old broken behaviour
   with `force: false`. Solid regression guard against re-introducing the bug.

---

## Summary

| ID | Severity | Status |
|----|----------|--------|
| F1 | low      | FIXED  |
| F2 | medium   | FIXED  |
| F3 | low      | FIXED  |
| F4 | low      | FIXED  |
| F5 | low      | FIXED  |
| F6 | info     | n/a (was correct) |
| F7 | low      | FIXED  |

**Verdict: PASS.** All must-fix and should-fix items resolved. Ready to merge.
