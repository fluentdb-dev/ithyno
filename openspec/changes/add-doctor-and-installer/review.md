---
verdict: needs-rework
findings:
  - id: F1
    severity: low
    area: doctor.ts / checkCommand
  - id: F2
    severity: medium
    area: server/index.ts / agmsg install
  - id: F3
    severity: low
    area: doctor.ts / readyForManager
  - id: F4
    severity: low
    area: doctor.ts / checkCommand (Windows)
  - id: F5
    severity: low
    area: Settings.tsx / PrereqInstallModal SSE cleanup
  - id: F6
    severity: info
    area: server/index.ts / WS broadcast timing
  - id: F7
    severity: low
    area: test coverage
---

# Review: add-doctor-and-installer

Reviewed commit `0878926`. Overall design is sound — parallelism model,
SSE lifecycle, auth layering, and WS event integration are correct. Two issues
need fixing before merge.

---

## F2 — MEDIUM: `cpSync force:false` silently leaves partial installs broken

**File:** `server/index.ts` ~line 449

```ts
cpSync(vendorRoot, TARGET_ROOT, { recursive: true, force: false });
```

`force: false` with the default `errorOnExist: false` means Node silently
skips any file that already exists at the destination. If a previous install
was interrupted (partial copy), re-running "Install agmsg" will succeed with
exit 0 but leave missing files in place. The vendor marker `send.sh` may
already exist from a prior partial run, making the early-return guard at line
~420 fire and reporting "already installed" even though the tree is incomplete.

**Fix:** Use `force: true` to always overwrite, or write to a temp directory
and atomically rename to `TARGET_ROOT`.

---

## F1 — LOW: `whichProc` leaks after `settle()` fires

**File:** `server/doctor.ts`, `checkCommand`

`whichProc` (the `which <cmd>` subprocess) is spawned concurrently with the
version command. When `settle()` fires early — via ENOENT on the version
command or via the 2 s timeout SIGKILL — the Promise resolves, but
`whichProc` is still running and its `close` handler will write to
`resolvedPath` (now dead). The subprocess exits quickly in practice (it is
just `which`), so this is not a true zombie, but it is an unguarded process
reference that writes to closed-over state after the outer Promise has
resolved.

**Fix:** In the `settle()` guard, also kill `whichProc`:

```ts
const settle = (result: CliStatus) => {
  if (settled) return;
  settled = true;
  try { whichProc.kill(); } catch { /* ignore */ }
  resolve(result);
};
```

Note: `whichProc` is referenced before it is assigned in this pattern, so
the `kill()` call needs to be wrapped safely or hoisted after the spawn (Node
allows calling `.kill()` after `close` fires; it is a no-op).

---

## F3 — LOW: `readyForManager` redundantly includes `antigravity`

**File:** `server/doctor.ts` lines 205-208

```ts
// readyForManager: at least one NAMED agent CLI (not antigravity alias) is installed.
const AGENT_KEYS: Cli[] = ["claude", "codex", "agy", ..., "antigravity"];
const readyForManager = AGENT_KEYS.some((k) => agents[k]?.installed === true);
```

The comment says "not the antigravity alias", but `antigravity` is included
in `AGENT_KEYS`. Because both `agy` and `antigravity` run the same binary
(`agy`), both will be `installed: true` at the same time — so the logic is
not wrong, but the comment contradicts the code and makes intent unclear.

**Fix:** Either remove `antigravity` from `AGENT_KEYS` (since `agy` already
covers it) or remove the contradicting comment.

---

## F4 — LOW: `which <cmd>` fails silently on Windows

**File:** `server/doctor.ts`, `checkCommand`

`spawn("which", [cmd])` emits `ENOENT` on Windows (where the equivalent is
`where`). The error handler silently ignores this, so `resolvedPath` is always
`undefined` on Windows. The install endpoint already falls through to the
unsupported-platform path for `tmux`, so this only affects the doctor report
(missing `path` field for every CLI on Windows). Given the proposal explicitly
targets macOS/Linux, this is low priority but worth a comment.

**No code change required;** add a comment noting Windows `path` resolution
is skipped.

---

## F5 — LOW: `PrereqInstallModal` does not cancel the stream reader on unmount

**File:** `web/src/pages/Settings.tsx`, `PrereqInstallModal`

```ts
return () => { cancelled = true; };
```

The `cancelled` flag stops `setLines` calls after unmount, but the
`reader.read()` call still holds the underlying fetch stream open. If the
modal is somehow unmounted while the install is in progress (e.g., the user
navigates away), the server-side SSE connection is not closed until the
browser GC-s the reader.

In practice the "Close" button is disabled until `done`, so the user cannot
dismiss early. Still, the cleanup should call `reader.cancel()`:

```ts
return () => {
  cancelled = true;
  reader?.cancel().catch(() => {});
};
```

This requires hoisting `reader` to a `useRef` or the outer scope.

---

## F6 — INFO: WS broadcast timing is correct

`reply.raw.end()` fires before `void runDoctor().then(broadcast(...))` in all
code paths. So the client receives SSE `done` first, then the WS
`doctor-updated` event. This is correct — the SSE modal closes, then the
store updates, triggering a table refresh. No action needed.

---

## F7 — LOW: No integration test for POST /api/doctor/install lifecycle

`server/doctor.test.ts` covers `checkCommand` and `runDoctor` shape only.
The SSE stream lifecycle (chunked output, `done` event, 5 min timeout, kill
on disconnect) and the `tool` validation 400 path have no test coverage.
The Settings modal SSE reader is also not tested.

Acceptable as-is given the manual verification note in `tasks.md`, but a
future ticket should add an integration test for at least the 400 validation
and the happy-path SSE stream.

---

## Summary

| ID | Severity | Must-fix before merge? |
|----|----------|----------------------|
| F2 | medium   | yes — silent partial install is a correctness bug |
| F1 | low      | yes — close the dangling process reference |
| F3 | low      | no — cosmetic/comment |
| F4 | low      | no — comment only |
| F5 | low      | no — edge case, no user-visible impact |
| F6 | info     | no — correct as-is |
| F7 | low      | no — defer to follow-up |

**Verdict: needs-rework.** Fix F2 and F1, then re-submit.
