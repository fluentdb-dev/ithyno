---
tags: [feature/cross-cli, feature/onboarding, role/manager]
execution: worktree
---

## Why

The current ithyno command surface is Claude-shaped: `/opsx:propose` and
`/ithy-opsx:dispatch`. Codex custom prompts are flat names, and the requested
operator interface is `openspec-propose "…"` for OpenSpec and an equivalent
`ithy-opsx-*` name for ithyno skills. The bundled OpenSpec Codex adapter currently
generates `CODEX_HOME/prompts/opsx-<id>.md`, so neither its file names nor the
Kanban Start injection match that interface.

## What Changes

1. Define a Codex-native command namespace:
   `openspec-<command>` for portable OpenSpec flows and
   `ithy-opsx-<command>` for ithyno-specific flows. The same skill behavior is
   exposed under these names; the existing Claude slash names remain unchanged.
2. During Codex New Project initialization, isolate `CODEX_HOME` to the
   project and generate/rename the upstream OpenSpec prompt files there. This
   prevents init from mutating a user's global prompts and makes the project
   command surface reproducible.
3. Render ithyno universal skills to the corresponding Codex-native prompt
   names. Keep the Codex Manager on its normal authenticated `CODEX_HOME`;
   the initialization-only override must not leak into runtime.
4. Resolve every dispatched role prompt by its target worker CLI, not only the
   Manager's entry prompt. A Codex code worker receives
   `openspec-apply-change <change-id>`; Codex review and verify workers receive
   `ithy-opsx-review <change-id>` and `ithy-opsx-verify <change-id>`. Other CLIs
   retain their existing slash-command prompts.
5. Preserve the Claude surface as the source of truth: convert Claude
   ithy-opsx commands into Codex prompts, and mirror Claude ithy-opsx skills
   into Codex skills. Commands SHALL NOT be promoted into skills.
6. Add executable coverage for prompt generation, the selected manager's
   startup environment, and the exact injected string. The exact interactive
   trigger syntax supported by the installed Codex version is verified before
   removing the `(unverified)` Manager label.

## Capabilities

### New Capabilities

- `codex-native-command-aliases`: provides project-local, flat Codex command
  names for OpenSpec and ithyno workflows.

### Modified Capabilities

None.

## Impact

- `bin/new-project-chain.js` / initialization plumbing — project-scoped Codex
  prompt generation.
- `server/skill-renderer/renderers/codex.ts` — native alias filenames.
- `server/sync/pty.ts` and worker spawn handling — Codex runtime preserves its
  normal authenticated environment.
- `web/src/hooks/useStartFlow.tsx` and related Start surfaces — per-manager
  command injection.
- `ithyno/skills/`, dispatch prompt resolution, and worker spawn tests —
  per-role Codex command mapping and capability checks.
- Tests and AGENTS guidance — command mapping and compatibility contract.
