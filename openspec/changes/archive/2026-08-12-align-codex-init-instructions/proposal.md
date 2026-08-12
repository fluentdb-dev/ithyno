---
tags: [area/init, feature/cross-cli, role/manager]
execution: worktree
---

## Why

The initialization flow has a mature Claude-facing contract in
`templates/CLAUDE.md`, but a project initialized with Codex as its Manager
does not receive an equivalent repository instruction file. Codex reads the
root `AGENTS.md` contract; relying on the Claude-only template means it can
start with the correct `agents.yaml` command but without the OpenSpec rules,
role boundaries, and verification discipline that Claude receives.

The current Codex renderer also writes project-local prompt files, while the
bundled OpenSpec Codex adapter documents its command surface as
`CODEX_HOME/prompts`. Project initialization must not silently claim that a
repository-local prompt is a portable Codex command surface.

## What Changes

1. Add a CLI-neutral `templates/AGENTS.md` instruction template. Its OpenSpec
   proposal-first rule, standard lifecycle, artifact locations, and safety
   rules mirror the intent of `templates/CLAUDE.md`, expressed for
   AGENTS.md-compatible CLIs (including Codex).
2. Make the normal scaffold copy that file with the existing idempotent
   create/skip/force behavior. A fresh Codex-managed project will therefore
   have repository-local instructions before the OpenSpec initialization
   subprocess runs; user-authored `AGENTS.md` remains untouched by default.
3. Add Codex to the New Project Manager picker as an **unverified** Manager
   candidate whenever `ithyno doctor` detects it. Selecting it shall flow
   through the existing init chain and create `agents.yaml` with
   `command: codex`; the UI must not claim resume or command-surface parity.
4. Treat the Codex prompt surface as a separately verified integration:
   document the supported project-local mechanism in the Codex renderer only
   after an executable Codex smoke test proves discovery. Until then,
   initialization relies on `AGENTS.md` for project instructions and does not
   present `.codex/prompts/` as a guaranteed command installation.
5. Add regression tests for fresh, existing, and forced `AGENTS.md` scaffold
   behavior, plus an initialization-chain test proving the Codex choice
   preserves the generated instruction file.

## Capabilities

### New Capabilities

- `codex-init-guidance`: supplies a durable, repository-local OpenSpec
  workflow contract to Codex after initialization.

### Modified Capabilities

None.

## Impact

- `templates/AGENTS.md` — new portable instruction template, kept aligned
  with workflow-relevant portions of `templates/CLAUDE.md`.
- `bin/init.js` and `server/init.test.ts` — no new copy mechanism is expected;
  tests make the existing template walker contract explicit for AGENTS.md.
- `web/src/components/InitDialog.tsx` and tests — include detected Codex in
  the Manager candidates with the existing `(unverified)` affordance.
- `bin/new-project-chain.js` tests — establish that the later `openspec init
  --tools codex` step does not remove the project contract.
- `server/skill-renderer/renderers/codex.ts` and its tests — update only after
  the discovery path is verified; no global `CODEX_HOME` writes are introduced
  by project initialization.
