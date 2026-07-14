---
tags: [agents-yaml, area/server, template-vars, feature/dispatch]
---

# Add `${session_id}` template variable — change-scoped, server-persistent

## Why

`agents.yaml` supports three template variables in `args`, `env`, and
prompts: `${change_id}`, `${worktree_path}`, `${branch}`. None let a
Worker refer to a "conversation" or "session" that groups multiple
related dispatches.

The immediate need is Worker CLIs that support a `--session` flag
(Claude Code, `gh copilot`, etc.) — they use session IDs to group
related requests into a shared conversation for context reuse and
cost accounting. Users want to hand the CLI a stable ID via
`args: [--session, "${session_id}"]` and have every dispatch on
the same change carry that ID.

The natural grouping unit is the **OpenSpec change**: all Manager +
Worker activity on `add-foo` conceptually belongs to one
conversation. Multiple dispatches on the same change should share
the same session ID; different changes get different IDs; **server
restart MUST preserve the ID** so a long-running change keeps its
conversation identity across dashboard reboots.

## What Changes

### Server — persistent session store

1. New module `server/agents/session-store.ts` — file-backed
   `Map<changeId, sessionId>` persisted at `.ithyno/sessions.json`
   under the project root. Exports:

   - `getOrCreateSessionId(projectRoot, changeId): Promise<string>`
     — reads the map; if `changeId` is missing, mints
     `session-<changeId>-<base36-ts>` and writes back atomically.
   - `getSessionId(projectRoot, changeId): Promise<string | null>`
     — read-only lookup; returns `null` when unset.

2. Atomic write via `.tmp` + rename (matches `config-writer.ts`
   convention). Corrupt / unreadable file is treated as an empty
   map with a warning; the next `getOrCreateSessionId` mints a
   fresh sessionId and overwrites, so recovery is transparent.

3. `.gitignore` gains `.ithyno/` — the sessions map is local state,
   not source of truth.

### Server — template substitution

4. `AgentRegistry.resolve()` SHALL accept `session_id: string` in
   its `vars` object (alongside the existing three). `${session_id}`
   SHALL be substituted in `args`, `env` values, and per-role
   prompts using the same regex-based replacement.

5. When `session_id` is not supplied (or is the empty string),
   `${session_id}` SHALL be substituted with the literal empty
   string. This matches the "always-defined" convention of the
   other template vars — users who want to detect absence check
   for an empty value in their prompt logic.

### Server — dispatch endpoint

6. `POST /api/agents/dispatch` accepts an optional `sessionId`
   field in the request body:

   - **When supplied**: its value flows through `runner.run()` to
     `registry.resolve()` as `vars.session_id` (explicit override
     for testing or advanced use).
   - **When absent**: the handler calls
     `getOrCreateSessionId(cwd, input.changeId)` to look up the
     stable per-change sessionId, minting one on first request.
     The lookup runs **before** change-existence validation, so a
     dispatch against a non-existent `changeId` still creates a
     sessions.json entry (unused, harmless) but ultimately returns
     404 to the client. Users who care about orphan entries can
     hand-edit `.ithyno/sessions.json`.

7. `runner.run()` accepts an optional trailing `sessionId?: string`
   parameter (after the existing `dispatchedRole`) and passes it
   through to `registry.resolve()`.

### Manager PTY

8. The Manager PTY does NOT get an auto-generated sessionId. It
   is not scoped to a single change, so no natural session value
   applies. When a Manager's `initialInput` references
   `${session_id}`, the substitution resolves to the empty string
   (same fallback rule as anywhere else). Users who want their
   Manager to hold a sessionId can pass it explicitly on each
   `curl` to `/api/agents/dispatch`.

### Server — Job model

9. `Job.sessionId?: string` — new optional field populated from the
   resolved value at spawn time. `/api/agents/jobs` responses
   include it so a client can correlate a job back to its
   originating session. Orphan-adopted jobs leave `sessionId`
   undefined.

### Spec deltas

10. **ADDED**: `Template Variable Session Id`.
11. **ADDED**: `Change-Scoped Session Id Persistence`.
12. **ADDED**: `Dispatch Session Correlation`.

## Impact

- **Backward compatible**: existing `agents.yaml` files that don't
  reference `${session_id}` see no behavior change. The template
  var is opt-in.
- **New local state directory**: `.ithyno/` is created lazily on the
  first `getOrCreateSessionId` call. Users delete `.ithyno/sessions.json`
  to reset. `.gitignore` addition ensures accidental commits don't
  leak the local state.
- **Session survives server restart**: a dashboard restart mid-change
  keeps the same sessionId, so a long-running `--session <id>`
  Claude Code conversation isn't broken by a `npm run dev` restart.
- **Session survives PTY restart**: closing / reopening the Terminal
  panel doesn't change the sessionId (the ID is not PTY-scoped).
- **Orphan entries**: `sessions.json` may accumulate entries for
  changes that no longer exist (archived, deleted). Harmless;
  cleanup is a plausible follow-up but not required.

## Out of scope

- **UI surfacing**: the dashboard doesn't need to render session IDs
  for this change to be useful — Worker CLIs consume them internally.
  A "Session: session-add-foo-abc" line in the Kanban card head or
  job row is a plausible follow-up.
- **Explicit reset action**: no `POST /api/agents/sessions/reset`
  or UI button. Users edit `.ithyno/sessions.json` by hand.
- **Sub-change sessions**: no per-role or per-attempt sub-IDs.
  Every dispatch on the same change reuses the same session.
- **Cross-project sessions**: `.ithyno/` is scoped to a project
  root. Two dashboards on different repos have separate stores.
- **Cryptographic randomness**: the ID is a stable timestamp for
  readability, not for unguessability. Users MUST NOT rely on it
  as a security token.
