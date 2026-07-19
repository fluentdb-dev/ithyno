---
tags: [feature/skills, area/skills, area/web, area/docs, runtime-collapse-followup, multi-cli]
---

# Wire role→CLI + worktree decision into the skill layer

## Why

Two related decisions currently live at the wrong layer of the stack:

1. **Worktree vs terminal branching** — the Kanban Start button
   (`useStartFlow.tsx`) reads `parallelExecution` from `agents.yaml`
   and either spawns a worktree agent via `POST /api/agents/run` or
   injects `/opsx:apply <id>` into the embedded terminal. This split
   made sense when the UI had to gate a server-side runtime; post
   runtime-collapse (R1–R9) the UI is doing bookkeeping for a runtime
   that no longer exists.

2. **CLI selection per role** — `agents.yaml` lets users declare
   `command: copilot` for the review role, `command: agy` for another
   role, etc. But the Manager loop skill (`.claude/commands/opsx/manage.md`)
   invokes each stage via the Task tool with no `subagent_type`, so
   every worker actually runs inside a Claude subagent. Copilot / Agy
   entries are silently ignored. The user's intent when they write:

   ```yaml
   - name: claude          # code role  → claude --model sonnet
   - name: copilot-review  # review role → copilot --yolo -s ...
   ```

   is that code runs on Claude and review runs on Copilot. Today the
   review still runs on Claude.

Both decisions should move to the **skill layer** (Claude has bash,
Task tool, and can read `agents.yaml` directly). This propose captures
the target design for both, but implements only the UI walk-back now.

Also there's a **spec-vs-reality gap**: `Manager Loop Slash Command`
and `Review Worker Slash Command` in `openspec/specs/dashboard/spec.md`
still reference `/opsx:dispatch code|review|verify`, an endpoint the R1
revert removed. This propose fixes those references at the same time
(spec text updated; matching skill file rewrite lands in Phase 2).

## What Changes

The propose is **phased**: Phase 1 lands with this change; Phase 2 is
deferred to a follow-up impl.

### Phase 1 (this change, impl now) — UI walk-back

The Kanban Start button and the ChangeDetail Start button STOP making
execution decisions. Both actions collapse to:

```
inject `/opsx:apply <change-id>` into the embedded terminal
```

Concretely:

- `web/src/hooks/useStartFlow.tsx`:
  - Remove `parallelExecution` branching in `startImplementation`
  - Remove `startWorktreeFlow`, `AgentPickerModal`, `selectStartAgent`
    dependencies
  - Keep only terminal-inject flow + `CommandModal` for the apply prompt
  - Toasts still surface prerequisite failures (`agents.length === 0`,
    no embedded terminal)
- `web/src/components/AgentPickerModal.tsx`: delete
- `web/src/util/selectStartAgent.ts` + test: delete
- `web/src/components/UncommittedProposalModal.tsx`: delete
  (was gating a UI-side worktree flow — becomes obsolete)
- `web/src/components/ParallelStartLauncher.tsx`: keep, but its
  candidate list simplifies (no worktree prereqs to check)
- `Settings` toggle remains — `parallelExecution` value survives in
  `agents.yaml` as a **skill-consumer** signal for Phase 2

Server side is untouched: `POST /api/agents/run` and worktree helpers
stay in place because Phase 2 skills may drive them via the API (or
may replace them; TBD).

### Phase 2 (spec-only now, impl deferred) — Skill layer takes both decisions

Documented as spec deltas so the future contract is legible; not
implemented in this change. Follow-up impl change (id TBD, likely
`impl-skill-driven-worktree-and-cli`) will:

- Rewrite `.claude/commands/opsx/manage.md` to read `agents.yaml` and
  branch per stage: `command == "claude"` → Task tool subagent,
  otherwise → subprocess `<cmd> <args...> -p "<prompt>"`. Success is
  judged by a **3-stage contract** (subprocess exit / `review.md`
  existence / `verdict` frontmatter).
- Rewrite `.claude/commands/opsx/apply.md` (or introduce a helper) so
  the skill reads `parallelExecution` from `agents.yaml` and either
  runs in-place or does `git worktree add` + branch switch.
- Add repo-level instructions files so non-Claude CLIs are grounded:
  - `.github/copilot-instructions.md` (auto-loaded by Copilot)
  - `AGENTS.md` (Antigravity / CLI-agnostic)
  - `CLAUDE.md` already covers Claude; no touch.

## Spec deltas

`dashboard` capability:

**Phase 1 deltas (implemented now):**

- REMOVED `Start Flow Consumes Config Instead Of Picker` — the picker
  was already gone; now the config-consumption in UI also goes away.
- ADDED `Start Flow Delegates Execution To Skill Layer` — the new
  target-state requirement.
- MODIFIED `IN-PROGRESS Column Start Launcher` — the "dispatches
  directly (worktree/terminal) or opens ExecutionPicker" scenario is
  rewritten to describe the always-inject-skill behavior.

**Phase 2 deltas (spec captured now; impl deferred):**

- MODIFIED `Manager Loop Slash Command` — describes agents.yaml-driven
  CLI dispatch (claude → Task tool / others → subprocess) and 3-stage
  success contract.
- MODIFIED `Review Worker Slash Command` — drop `/opsx:dispatch`
  references; template is CLI-agnostic.
- ADDED `Repo-Level Agent Instructions Files` — `.github/copilot-instructions.md`
  and `AGENTS.md` SHALL exist with the worker contract.

## Impact

- **Affected specs**: `dashboard` — 1 ADDED + 1 REMOVED + 3 MODIFIED
  across both phases (Phase 1: 1 REMOVED + 1 ADDED + 1 MODIFIED;
  Phase 2: 2 MODIFIED + 1 ADDED)
- **Affected code (Phase 1)**:
  - `web/src/hooks/useStartFlow.tsx` (simplify)
  - `web/src/components/AgentPickerModal.tsx` (delete)
  - `web/src/components/UncommittedProposalModal.tsx` (delete)
  - `web/src/util/selectStartAgent.ts` + test (delete)
  - `web/src/styles.css` (remove picker CSS if orphaned)
- **Affected code (Phase 2, deferred)**:
  - `.claude/commands/opsx/manage.md` (rewrite)
  - `.claude/commands/opsx/apply.md` (extend to consume `parallelExecution`)
  - `AGENTS.md`, `.github/copilot-instructions.md` (new)
- **Risk**:
  - Phase 1 removes the worktree spawn path from UI. Users on
    `parallelExecution: true` temporarily lose parallel worktree
    execution until Phase 2 lands. Mitigation: current session's
    Claude session can still manually `/opsx:apply <id>` in a separate
    worktree via bash; the change is 'the UI does one thing, the human
    or skill drives the rest'.
  - Server-side worktree machinery stays for Phase 2 to reuse.
- **Migration**: `agents.yaml` schema unchanged. Users notice fewer
  clicks (no picker, no agent-selection modal); `Settings` toggle
  remains but its effect is deferred until Phase 2.
