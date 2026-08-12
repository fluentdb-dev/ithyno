---
tags: [feature/cross-cli, feature/dashboard, role/manager]
execution: worktree
---

## Why

`add-codex-native-command-aliases` establishes the Codex prompt namespace and
fixes the Start flow, but several command entry points still construct
Claude-style slash commands directly. In particular, the Overview page's
**Propose a new change** dialog always injects `/opsx:propose`, so a Codex
Manager cannot invoke the newly materialized `openspec-propose` prompt.

The same pattern occurs in Kanban/Change Detail actions and in the server-side
Import handoff. Fixing only the proposal dialog would leave the product
internally inconsistent and invite the same omission in future entry points.

## What Changes

1. Introduce one manager-aware command resolver for UI and server command
   injection. For Codex it maps OpenSpec commands to `openspec-*` and ithyno
   commands to `ithy-opsx-*`; all non-Codex managers preserve the slash commands.
2. Route every current interactive command entry point through that resolver:
   Propose a new change, Start/dispatch, Apply, Archive, Merge, and Import.
3. Make the command preview and submit label derive from the resolved command,
   so the dialog accurately shows the string that will be injected.
4. Add a repository sweep regression test or inventory assertion covering all
   command-producing surfaces, plus focused Codex and Claude behavior tests.

## Capabilities

### New Capabilities

- `manager-aware-command-entrypoints`: supplies a complete, manager-aware
  command surface for interactive dashboard and server handoff actions.

### Modified Capabilities

None.

## Impact

- `web/src/pages/Overview.tsx` — proposal dialog.
- `web/src/hooks/useKanbanActions.tsx` and `web/src/pages/ChangeDetail.tsx` —
  apply/archive/merge dialogs.
- `web/src/hooks/useStartFlow.tsx` — migrate to the shared resolver.
- `server/import-spec-gen.ts` and its dependencies — Import Manager injection.
- Focused UI/server tests and the command resolver module.
