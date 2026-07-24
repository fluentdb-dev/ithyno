---
date: 2026-07-23
verdict: pass
findings: 2
round: 2
commit: 9a5755c
---

# Review: expand-init-to-scaffold-agents (round 2)

Round 1 returned 3 findings (1 medium, 1 low, 1 info). This round verifies
all three are resolved and does a fresh pass for regressions. Verdict: **PASS**.

---

## Round-1 finding verification

### F1 (medium — BUG): `errorMessage` in `useEffect` deps — RESOLVED

`errorMessage` is absent from the dependency array, which now reads:

```ts
}, [dialogPhase, target, targetValid, chosenCli]);
```

`sseErrored` is declared as a closure-local `boolean` inside `run()` and set
in all three error paths:

- HTTP error on `fetch` response (line 162)
- SSE `"error"` event parsed from the stream (line 183)
- `catch` block for network/reader failure (line 192)

The agents-yaml write block at line 213 guards on `!sseErrored`, not on
`!errorMessage`. The re-fire loop is eliminated. No regression detected.

### F2 (low — BUG): follow-up POST re-ran `openspec init --force` — RESOLVED

`agentsYamlOnly?: unknown` added to `InitBody` (server) and
`agentsYamlOnly?: boolean` added to `InitProjectPayload` (client). Server
handler at line 569 skips `runInit` when `body.agentsYamlOnly !== true` is
false — only the doctor gate + `writeAgentsYaml` run. OnboardingProject now
sends `agentsYamlOnly: true` in the follow-up POST instead of `force: true`.
The openspec/ scaffold written by the SSE chain is never overwritten.

The doctor gate and `resolveManagerFromDoctor` still execute unconditionally
(before the `agentsYamlOnly` branch). This is correct: we want the 409 guard
even when only writing agents.yaml, and the client always passes
`manager: { command: chosenCli! }` (CLI chosen in the dialog).

### F3 (info): TODO comment on `Cli`/`CLI_PRIORITY` duplication — RESOLVED

`TODO(F3)` comment added in `web/src/types.ts` above the `Cli` type,
explaining the intentional duplication with `server/doctor.ts`, the plan to
add a compile-time guard when `add-doctor-and-installer` lands, and the drift
risk. Comment is accurate and actionable.

---

## Fresh-pass findings (round 2)

### NF1 — INFO: orphaned `eslint-disable` comment in `server/index.ts`

**File:** `server/index.ts`, line 567

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let initResult: Record<string, unknown> = { ok: true };
```

The suppression comment targets `no-explicit-any`, but the next line uses
`Record<string, unknown>`, not `any`. The comment was left from a draft and
suppresses nothing. It is harmless but creates false impressions about the
type annotation. Remove the comment or move it to the correct line (line 582:
`initResult = runInitResult as unknown as Record<string, unknown>`).

**Not a merge blocker.**

### NF2 — INFO: `agentsYamlOnly` HTTP path has no unit test

**File:** `server/init.test.ts`

The `agentsYamlOnly: true` short-circuit in `POST /api/init` (skip `runInit`,
call `writeAgentsYaml`, return `{ ok: true, managerCommand }`) is not covered
by any test. The component tests for `writeAgentsYaml` and `runInit` exist in
isolation and integration, but none exercise the HTTP handler with
`agentsYamlOnly: true` to confirm:

- `runInit` is not called (no `openspec/` mutation)
- `writeAgentsYaml` is still called
- Response includes `{ ok: true, managerCommand: "..." }`
- 409 still fires if no CLI is installed (doctor gate still active)

Not a merge blocker given the sub-unit coverage is solid, but a follow-up
test would close the gap before `add-doctor-and-installer` lands and the
path becomes load-bearing.

---

## Test coverage (round 2 check)

All 4 required paths from the brief still covered:

| Path | Test | Status |
|------|------|--------|
| 409 no CLI installed | `resolveManagerFromDoctor` — 409 test | PASS |
| 400 bad manager.command | `resolveManagerFromDoctor` — 400 test | PASS |
| 200 priority default | `resolveManagerFromDoctor` — priority tests | PASS |
| agents.yaml written | `writeAgentsYaml` + integration test | PASS |

Outcome.md reports `npm test` 446 pass (1 pre-existing `sharp` failure,
unrelated), `npm run typecheck` clean, `npm run build` clean.

---

## Summary

All three round-1 findings are resolved without regressions. Two new
info-level observations (orphaned eslint comment, missing HTTP-layer test for
`agentsYamlOnly` path) are noted but are not merge blockers.

**Verdict: PASS** — ready to merge.
