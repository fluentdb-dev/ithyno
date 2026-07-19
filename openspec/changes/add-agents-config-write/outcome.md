# Outcome: add-agents-config-write

## ✅ Worked

- **Atomic write via `.tmp` + rename.** Single syscall replacement —
  a crash mid-write leaves either the old file or the new file, never
  partial YAML. Test asserts `.tmp` sibling is gone after success.
- **Loader-side `validateAgents` reused, not duplicated.** Exported
  from `registry.ts` as-is and applied to the whole result AFTER the
  payload is merged in. This means the same shape rules that the boot
  path enforces gate every write, without a second validator to keep
  in sync.
- **Top-level keys survive byte-intent.** `runtimes:`,
  `worktreePool:`, and any unknown top-level keys pass through the
  parse → merge → stringify round-trip. Test seeds a `customTopKey`
  and asserts it survives.
- **Discriminated payload contract matches the 5.2 client.** Same
  `AgentConfigPayload` shape as `web/src/types.ts`, hand-mirrored
  (comment names the mirror). No breaking change between propose and
  archive.
- **Watcher does the reload; we don't.** The existing `agentRegistry.
  startWatching()` picks up our own write and reloads the in-memory
  registry. Clients see the update on the next `GET /api/agents/config`.
  Zero plumbing in the handler.

## ⚠️ Surprises

- **coerce + validate is a two-layer guard.** I initially thought
  `coercePayload` alone would be sufficient, but the loader's
  validator catches cases the coerce step lets through (e.g., mixed
  legacy + runtime after an upsert, when the coerce path only checks
  the incoming payload). Having both layers costs 40 LOC and gives a
  belt-and-braces guarantee — a bad write never touches disk.
- **`yaml` library preserves neither comments nor key order across
  parse+stringify by default.** Tests only assert semantic equality
  (parsed shape), not byte equality of the whole file. If a future
  version of Phase 5 needs comment preservation, `yaml.parseDocument`
  + `Document` API is the escape hatch. Out of scope here.

## 🔁 Differently

- **Considered a single-step upsert+delete via a `changes: []` array
  in the payload.** Cut — the 5.2 modal only ever produces one
  mutation at a time (per Save click), so a batch API would be
  unused surface. Keep it simple.
- **Considered a compare-and-swap header (`If-Match: <hash>`)** to
  prevent two tabs from overwriting each other's edits. This is
  single-user local — the second Save just wins. Add-agents-yaml-cas
  as a separate change if it ever becomes real.

## 🌱 Follow-ups

- **End-to-end manual smoke** — Phase 5.1 + 5.2 + 5.3 together. Open
  the Agents tab, edit an agent's role, verify the file on disk and
  that the tab re-reads it. Deferred here (the tests exercise the
  server-side contract; the client side was exercised in 5.2).
- **Delete-with-running-job guard.** Today the handler happily
  deletes an agent whose job is currently running. Not catastrophic
  (the running job has all state on the runner) but the UI could
  refuse the Delete in that case. Client-side gate would be cleaner
  than a server-side one — the client already knows which agents
  have running jobs.
- **Runtime-existence validation.** Currently a payload can name a
  runtime that isn't declared in the same file; the loader validator
  would eventually catch it on the reload. A stricter server-side
  check (name must be in `runtimes:`) would give a clearer error at
  Save time. Deferred until a real user hits the ambiguity.
