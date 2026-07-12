---
tags: [phase-5, agents-tab, config, area/server]
---

# `POST /api/agents/config` — persist agents.yaml edits from the UI

## Why

Phase 5.2 (`add-agents-config-ui`) landed the client — Edit / Delete /
+ Add agent buttons, a form, and a `saveAgentConfig(payload)` API
call. Today the client's Save button hits `POST /api/agents/config`
and gets 404 back because no handler exists. The client translates
that 404 into a toast telling the user Phase 5.3 hasn't landed yet.

This change lands the write endpoint. Concretely: parse the incoming
`AgentConfigPayload`, validate it against the same shape rules the
loader uses, atomically round-trip the modification into
`agents.yaml`, and trigger a registry reload so the next `GET
/api/agents/config` (or any dispatch) sees the new state.

The registry already watches `agents.yaml` for external edits, so
our own write echoes through the watcher just like a hand-edit
would. There's nothing to plumb — the reload happens on its own.

## What Changes

### Server

1. **`server/agents/config-writer.ts`** — new module. Exports:
   - `applyAgentConfigPayload(projectRoot, payload)` — parse the
     current file, apply the upsert / delete, run the existing
     validator so a bad payload throws BEFORE the write hits disk,
     atomic-write to a `.tmp` sibling and rename over the original.
   - Preserves unrelated top-level keys (`runtimes:`, `worktreePool:`)
     and unknown keys byte-intent via the parse → merge → serialize
     pattern that `writeSidecar` uses.
2. **`server/index.ts`** — new `POST /api/agents/config` Fastify
   handler:
   - `isLocal` + CSRF (both inherited from existing hooks; explicit
     `isLocal` in-handler like every other write route).
   - Coerces the JSON body into `AgentConfigPayload` shape.
   - Rejects malformed payloads with 400.
   - On success, returns `{ ok: true }`.
   - Reload is fire-and-forget through the existing file watcher.

### Types

3. **`server/agents/registry.ts`** — export the internal
   `validateAgents` / `validateRuntimes` helpers (or a slim wrapper
   like `validateAgentDef(raw)`) so `config-writer` can reject bad
   payloads without duplicating the validation.

### Tests

4. **`server/agents/config-writer.test.ts`** — round-trip test:
   read an example file, upsert an agent, assert the written file
   parses back to the expected shape and unrelated keys survive.
   Also cover: delete removes the entry, upsert on existing name
   overwrites, delete on missing name 404s (via the handler).

## Impact

- **Files added**: `server/agents/config-writer.ts` (+ test).
- **Files modified**: `server/index.ts` (new handler), `server/agents/registry.ts`
  (export validator).
- **Client**: nothing. The 5.2 modal / Save button / toast pipeline
  already speaks this endpoint.
- **Blast radius**: the write is atomic (rename replaces the file
  in one syscall). A crash mid-write leaves either the old file or
  the new file, never partial YAML. If the payload fails validation
  the file is never touched.

## Out of scope

- **runtime + worktreePool editing** — the UI touches agents only.
  Editing `runtimes:` or `worktreePool:` stays hand-edit.
- **Multi-user coordination** — this is single-user local. No lock,
  no compare-and-swap. If two tabs Save at once the second one wins.
- **Confirmation of runtime existence** — the modal already prevents
  choosing a nonexistent runtime; the server accepts what it's given.
  A stricter validator (e.g., "runtime must be declared in the same
  file") can land later if it becomes a real bug.
