---
date: 2026-07-23
verdict: needs-rework
findings: 3
commit: 64fbe72
---

# Review: expand-init-to-scaffold-agents

Overall the change is structurally sound. Server logic is well-extracted,
test coverage is solid, typecheck passes, and the 4 required paths are all
exercised. Three findings require rework before merge.

---

## F1 — BUG (Medium): `errorMessage` in `useEffect` deps causes re-run loop

**File:** `web/src/pages/OnboardingProject.tsx`, line 228

```ts
}, [dialogPhase, target, targetValid, chosenCli, errorMessage]);
```

`errorMessage` must not be a dependency of the effect that launches the SSE
chain. The problem:

1. SSE chain runs, an error fires `setErrorMessage(...)`.
2. React re-runs the effect (deps changed). Cleanup cancels the previous run
   (setting `cancelled = true`), then a NEW invocation starts.
3. The new invocation checks `if (dialogPhase !== "running" || ...)` — all
   still true — so it fires another `/api/init/stream` request. The
   `if (!errorMessage)` guard at line 200 is evaluated in the new closure
   where `errorMessage` is still `null` (state snapshot at effect entry), so
   agents-yaml write will proceed even if the SSE phase errored.

**Fix:** Remove `errorMessage` from the dependency array. Track whether an
error already occurred inside a ref (`hasErrorRef`) or use a committed-flag
ref instead of reading the state variable inside the closure.

```ts
// replace the deps line with:
}, [dialogPhase, target, targetValid, chosenCli]);
// and guard agents-yaml write with a local flag set by the SSE error handler:
let sseErrored = false;
// ...in appendEvent for "error" type:
sseErrored = true;
setErrorMessage(e.message);
// ...then:
if (!sseErrored) { /* agents-yaml write */ }
```

---

## F2 — BUG (Low): follow-up POST `force: true` re-runs `openspec init`, not just agents.yaml write

**File:** `web/src/pages/OnboardingProject.tsx`, lines 203-207

The comment says:
```ts
force: true, // openspec/ already exists; only write agents.yaml
```

But `POST /api/init` with `force: true` does NOT only write agents.yaml. The
handler sequence is:

1. Doctor gate
2. `runInit({ force: true })` — this re-runs `openspec init --force`, which
   **overwrites** the already-written openspec/ scaffolding.
3. `writeAgentsYaml()`

So after the SSE chain scaffolds and inits openspec/ successfully, the
follow-up POST reinitializes the whole project with force. This is a
semantics bug: any customization the user or the SSE chain produced in
openspec/ between those two calls would be overwritten.

**Fix (short term):** Add a dedicated server endpoint or param
(e.g. `agentsYamlOnly: true`) that skips `runInit` and only executes the
doctor gate + `writeAgentsYaml`. Alternatively extend `/api/init/stream` to
accept `manager.command` in the body and write agents.yaml as a third step
inside the SSE chain — which the outcome.md already flags as the preferred
long-term fix.

Until then, the safest minimal fix is to pass `force: false` and handle the
"already initialized" error gracefully, or expose a separate
`POST /api/init/agents-yaml` endpoint.

---

## F3 — INFO (Low): `Cli` type defined in two places with no shared source of truth

**Files:** `server/doctor.ts` (stub, to be replaced) and `web/src/types.ts`

Both define the same `Cli` union literal (`"claude" | "codex" | ...`) and
`CLI_PRIORITY` array independently. The outcome.md acknowledges this, and the
stub will be replaced when `add-doctor-and-installer` lands. The risk is drift
after merge: if `add-doctor-and-installer` adds or renames a CLI value in
`server/doctor.ts`, `web/src/types.ts` will not be automatically updated.

**Recommendation:** When `add-doctor-and-installer` lands, add a compile-time
guard: a `satisfies` check or a type-import bridge (e.g. expose the server
type via a shared package or auto-generate `web/src/types.generated.ts` from
the server). This is not a merge blocker for this change, but log it as a
follow-up task before `add-doctor-and-installer` archives.

---

## Findings not flagged (per brief)

- **`server/doctor.ts` stub** — expected, documented, not a finding.
- **CSS classes unstyled** — known incomplete, acknowledged in outcome.md.
- **Double doctor call in SSE path** — minor inefficiency, no correctness
  impact while the stub is in place.

---

## Test coverage check

Required 4 paths per brief:

| Path | Test | Status |
|------|------|--------|
| 409 no CLI installed | `resolveManagerFromDoctor` — 409 test | PASS |
| 400 bad manager.command | `resolveManagerFromDoctor` — 400 test | PASS |
| 200 priority default | `resolveManagerFromDoctor` — priority tests | PASS |
| agents.yaml written | `writeAgentsYaml` + integration test | PASS |

All 4 required paths covered. 446 tests pass (1 pre-existing failure
in `build-icons` due to missing `sharp` package — unrelated).

---

## Summary

- F1 is a correctness bug that causes the SSE chain to re-fire on error,
  potentially skipping the error state. **Must fix.**
- F2 is a semantics bug: the follow-up POST re-runs `openspec init --force`
  instead of just writing agents.yaml. This can destroy openspec/
  scaffolding that the SSE chain already wrote. **Must fix (or document
  the accepted behavior and add a guard).**
- F3 is a future-maintenance risk to track. **No immediate action needed.**
