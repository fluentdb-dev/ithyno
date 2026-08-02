---
tags: [dashboard, import, watcher, pattern-a, pattern-b, ux]
execution: worktree
---

## Why

`refactor-import-to-task-tool-subagent` (archived 2026-07-23) shipped
the Task-tool transport but doesn't work end-to-end for the two
intended usage patterns:

- **Pattern A — in-flight import**: user has ithyno open on their
  own project P (agents.yaml present, Manager running). User picks a
  DIFFERENT target T via Electron menu → Import. Server injects the
  slash-command into Manager (works), sub-agent runs Task tool on T
  (works), sub-agent writes T/openspec/ + T/openspec/GENERATED.md
  (works). **But the server's file watcher watches P, not T** → no
  `state-replaced` broadcast fires for T's changes → dashboard hangs.

- **Pattern B — fresh import**: user opens a fresh non-openspec
  folder T. Runs Init (which currently DOES NOT scaffold agents.yaml
  — see `expand-init-to-scaffold-agents`). Assuming Init is
  expanded to also write agents.yaml + spawn Manager, the user then
  triggers Import on the same folder (T = PROJECT_ROOT). Sub-agent
  writes to T which IS PROJECT_ROOT → watcher fires → dashboard
  transitions to Kanban. Works — IF Init has scaffolded agents.yaml.

This change fixes Pattern A and confirms Pattern B works after Init
expansion lands.

Dependencies:
- `add-doctor-and-installer` — for the presence check.
- `expand-init-to-scaffold-agents` — for Pattern B's Manager
  availability at Init-time.

## What Changes

- **`ProjectRootWatcher` scope extension**:
  - When a Pattern A Import job dispatches, register the target root
    as an additional watch scope for the duration of the job.
  - The watcher fires on `<target>/openspec/GENERATED.md` creation,
    emits a `import-completed` WS event with `{ jobId, targetPath }`.
  - Deregister the extra watch after 30s post-completion or job
    cancellation.

- **New WS event `import-completed`**:
  - Broadcast by the server when the marker is detected.
  - Dashboard subscribes; different handling per pattern:
    - **Pattern B** (targetPath === PROJECT_ROOT): existing flow —
      refetch state, transition to Kanban.
    - **Pattern A** (targetPath !== PROJECT_ROOT): render a persistent
      dashboard notification "Import complete for `<targetPath>` —
      [Open imported project] [Dismiss]". Clicking Open triggers the
      Electron/VS Code project-switch handler.

- **Import job tracking**:
  - Server keeps a per-jobId record `{ jobId, targetPath, startedAt,
    pattern: "A" | "B" }`. TTL 1 hour. Bounded map (max 20 concurrent).
  - Used by the WS event dispatch (pattern discrimination) and by
    the "Open imported project" action.

- **`POST /api/import/spec-generation` returns pattern hint**:
  - Response gains `{ pattern: "A" | "B" }` derived from
    `targetPath === PROJECT_ROOT`.
  - Dashboard's ImportProgress uses this to know whether to auto-
    transition (B) or show the notification (A).

- **Doctor + Manager gate for Import**:
  - Server preflight adds: check `runDoctor()`. If
    `readyForManager: false`, reject with 409. This complements the
    existing 503 (Manager PTY not running) — 409 fires when even the
    prerequisites are missing.

## Success

- **Pattern A**: user opens ithyno on their working project (with
  agents.yaml + Manager) → Electron menu → File → Import → picks a
  DIFFERENT target → Confirm → progress notification →
  `import-completed` WS event → notification appears
  ("Import complete for /path/to/target — Open imported project") →
  click Open → project-switch handler opens target as the new
  ithyno project (which now has openspec/ + GENERATED.md).
- **Pattern B**: user opens fresh non-openspec folder → Init (with
  Manager scaffolding from `expand-init-to-scaffold-agents`) →
  agents.yaml written → Manager auto-launches → Import (same folder)
  → sub-agent writes specs → `import-completed` fires → dashboard
  transitions to Kanban of the freshly-imported specs.
- No dashboard hangs. Both flows always terminate with a clear next
  action.
- The Import endpoint returns 409 if doctor is not ready (no agent
  CLI installed) — clearer than the previous 503.
- Concurrent Pattern A imports (multiple targets) each get their own
  jobId and notification.

## Non-goals

- This change does NOT auto-open the target after Pattern A completes.
  User clicks "Open imported project" explicitly. This preserves the
  invariant that project switching is user-driven.
- This change does NOT retry failed imports. Failure surface is a
  notification with the sub-agent's error text; user can retry manually.
- This change does NOT extend the marker beyond `openspec/GENERATED.md`.
  Other file changes in the target don't trigger `import-completed`.
