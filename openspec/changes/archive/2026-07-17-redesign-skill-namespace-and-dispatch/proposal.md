---
tags: [feature/skills, area/skills, area/web, area/server, area/docs, redesign, runtime-collapse-followup, multi-cli]
---

# Redesign skill namespace and dispatch orchestration

## Why

The two previous propose (`wire-role-to-cli-in-manager-skill` +
`impl-skill-driven-worktree-and-cli`) landed with **ad-hoc structure**
that doesn't reflect the intended design:

1. **Skill namespace is muddled.** `.claude/commands/opsx/` mixes:
   - Pure OpenSpec commands (propose / archive / explore / revert /
     sync / answer / escalate) — no worktree, no ithyno API dependency
   - ithyno-tied commands (manage / code / review / verify) — depend on
     `.worktrees/`, `agents.yaml`, `POST /api/changes/:id/phase`,
     and ithyno's `review.md` artifact schema
- Result: the `/opsx:` prefix promises "OpenSpec workflow" but half
     the entries are actually ithyno-specific. `/ithy-opsx:` already
     exists (currently just `archive`) as the ithyno-flavored
     namespace, but hasn't been used consistently.

2. **`/opsx:code` duplicates `/opsx:apply`.** Both implement change
   tasks. The only meaningful differences:
   - `code` assumes worktree cwd (caller sets it up); `apply` runs
     wherever it's invoked.
   - `code` handles prior review findings as prompt suffix; `apply`
     doesn't.
   - `code` commits on the agent branch; `apply` defers commit to
     the caller / user.
   All three differences are cosmetic — a single well-designed
   worker prompt covers both use cases.

3. **`/opsx:apply` was ad-hoc extended in Phase 2 to become a
   dispatcher.** It got worktree bootstrap logic (read
   `parallelExecution`, create `.worktrees/<id>/`, cd). But `apply`
   is fundamentally a **worker prompt** — it should describe *what
   to implement*, not *where and how to spawn*. Worktree + CLI
   selection belong in the dispatcher (the caller of workers).

4. **`manage` is semantically wrong for what it does.** The skill's
   real job is *dispatch worker prompts to the right CLI*. "Manager"
   implies persistent oversight; "dispatch" describes the actual
   mechanic. Also, `manage` lives under `/opsx:` but is entirely
   ithyno-dependent (worktree, agents.yaml, `/api/changes/:id/phase`
   updates).

5. **UI Kanban Start injects `/opsx:apply <id>` directly.** That
   makes the injected string a worker prompt, but there's nothing
   between it and the terminal to do the dispatcher work (worktree
   bootstrap, CLI selection). It happens to work today because
   the Manager (persistent `claude --resume` in the terminal PTY)
   receives the prompt and does everything itself — but the
   coupling is invisible and fragile.

6. **`propose` and `verify` are not first-class roles.** `agents.yaml`
   recognizes `code` / `review` / `manager` today. `verify` is a
   stage inside Manager but no `roles: verify` entry can be
   validated. `propose` isn't in the vocabulary at all, even though
   agent-driven change creation is a natural extension.

## What Changes

### 1. Skill namespace split

**`.claude/commands/opsx/`** — pure OpenSpec (works in any repo,
no worktree / agents.yaml / ithyno API dependency):

```
answer.md
apply.md         (worker prompt; keep — see #3 below)
archive.md
escalate.md
explore.md
propose.md       (worker prompt; see #6)
revert.md
sync.md
```

Removed from `opsx/`: `code.md` (redundant with apply), `manage.md`,
`review.md`, `verify.md`.

**`.claude/commands/ithy-opsx/`** — ithyno-tied
(uses worktree convention, agents.yaml, `POST /api/changes/:id/phase`):

```
archive.md       (existing)
dispatch.md      (NEW — replaces manage.md; the orchestrator)
review.md        (moved from opsx/)
verify.md        (moved from opsx/)
```

Rationale: `/ithy-opsx:` prefix already carries the semantic "this
touches ithyno's server/worktree/agents.yaml". Manager loop and
`review.md`-schema workers belong there.

### 2. `/opsx:code` deleted (redundant with `/opsx:apply`)

Consolidate into a single "implement change tasks" worker prompt at
`.claude/commands/opsx/apply.md`. Prior review findings become a
prompt-suffix convention that `apply` handles when present.

### 3. `/opsx:apply` restored to a pure worker prompt

Revert Phase 2's worktree/parallelExecution logic from `apply.md`.
The skill goes back to describing *what to implement* (read change
files, tick unchecked tasks, use `openspec` CLI where useful).
`apply.md` no longer reads `agents.yaml` or creates worktrees — that's
the caller's job.

Add a **review-findings** section: when the initial prompt includes
`Prior review findings:` block, `apply` prioritizes those over
unchecked tasks, then continues with remaining tasks.

`apply` does NOT commit — the caller (dispatch / user) handles commit.

### 4. `/ithy-opsx:dispatch` (new) replaces `/opsx:manage`

`.claude/commands/ithy-opsx/dispatch.md` — the orchestrator invoked
by the persistent Manager (Claude live-shell session). Responsibilities:

- Read `agents.yaml` (top-level `parallelExecution` + `agents[]`).
- Read the change's `proposal.md` for optional `execution:` override.
- Set up worktree if needed (`git worktree add -b agent/<id>
  .worktrees/<id> HEAD`, idempotent).
- Dispatch each stage:
  - **code** → invoke a worker via the "Dispatch helper" protocol
    (Task tool for `command == "claude"`, subprocess `<cmd> <args...>
    -p "<prompt>"` otherwise). Prompt: `/opsx:apply <id>` (or
    `/opsx:apply <id>` + prior findings).
  - **review** → same protocol; prompt: `/ithy-opsx:review <id>`.
  - **verify** → same protocol; prompt: `/ithy-opsx:verify <id>`.
- Judge review / verify by the **3-stage success contract**:
  - subprocess exit non-zero → subprocess failure → escalate
  - subprocess exit 0 but `review.md` missing / unparseable → contract
    failure → escalate
  - `review.md` present with `verdict:` frontmatter → route on
    `pass` / `needs-rework`
- MAX_ITERATIONS=5 for the code↔review loop. Escalate to
  `needs-human` on non-convergence.
- Commit after each successful code stage (`git commit` on
  `agent/<id>`); worker prompts (apply) no longer commit themselves.

### 5. `/ithy-opsx:review` and `/ithy-opsx:verify` (moved worker prompts)

Move from `opsx/` to `ithy-opsx/`. Update wording to reflect the
namespace (`/ithy-opsx:review` in argument-hint, etc.). Add the
**sole-contract sentence** to Guardrails: "review.md is the artifact
the caller reads; stdout is ignored."

### 6. `propose` and `verify` as first-class roles

- `server/agents/registry.ts`: accept `propose`, `verify` in
  `roles: [...]` alongside `code`, `review`, `manager`.
- `server/agents/config-writer.ts`: same — allow these roles at
  upsert-time.
- Client (`AgentPublic.roles`) unchanged (already `string[]`).
- No mode restrictions on `propose` / `verify` — either
  `single-prompt` (typical) or `live-shell` (future via agmsg).
- `manager` role stays `live-shell` only (Manager is always-running,
  singleton).

### 7. UI Kanban Start injection change

`web/src/hooks/useStartFlow.tsx`: change the injected string from
`/opsx:apply <id>` to `/ithy-opsx:dispatch <id>`.

Rationale: the Manager (already-running Claude) sees the input and
evaluates the dispatch skill. Dispatch handles worktree + CLI
selection + loop. Workers run in worktrees and produce artifacts.

### 8. Repo-level instructions files

Create at repo root (as previously planned in Phase 2 — but with
namespace-corrected pointers):

- `AGENTS.md` (CLI-agnostic worker contract)
- `.github/copilot-instructions.md` (Copilot-specific pointer to
  the same contract)

Both cover role behaviors (code / review / verify) for non-Claude
CLIs. Point to `/ithy-opsx:` as the entry-point namespace.

### 9. Spec cleanup

Landed but now-inaccurate spec text in the `dashboard` capability:

- `Manager Loop Slash Command` — RENAMED to `Dispatch Slash
  Command`; body rewritten to reference `/ithy-opsx:dispatch` and
  the new namespace layout.
- `Review Worker Slash Command` — MODIFIED to reference
  `/ithy-opsx:review`.
- `Repo-Level Agent Instructions Files` — content stays; add a
  scenario noting the `/ithy-opsx:` prefix in worker invocations.
- `Start Flow Delegates Execution To Skill Layer` — MODIFIED to
  reference the new injected string (`/ithy-opsx:dispatch <id>`).
- `/opsx:apply Reads parallelExecution And Sets Up Worktree` (from
  the `impl-skill-driven-worktree-and-cli` propose that was
  archive-abandoned) — this requirement never landed because its
  archive change was discarded during redesign; no delta needed.

## Impact

- **Affected specs**: `dashboard` — 3 MODIFIED (+ 1 rename), 0 ADDED, 0 REMOVED
- **Affected code**:
  - `.claude/commands/opsx/`: delete `code.md`, `manage.md`,
    `review.md`, `verify.md`. Modify `apply.md`.
  - `.claude/commands/ithy-opsx/`: new `dispatch.md`, `review.md`,
    `verify.md`.
  - `server/agents/registry.ts`: role validator accepts `propose`,
    `verify`.
  - `server/agents/config-writer.ts`: same.
  - `web/src/hooks/useStartFlow.tsx`: inject
    `/ithy-opsx:dispatch <id>`.
  - `AGENTS.md` (new), `.github/copilot-instructions.md` (new).
- **Risk**:
  - Users who typed `/opsx:manage <id>` manually will see "command
    not found" — they must switch to `/ithy-opsx:dispatch <id>`.
    Fresh install, so no upgrade path complications.
  - Users who typed `/opsx:code <id>` manually — same, must switch
    to `/opsx:apply <id>`.
  - Third-party skills that reference `/opsx:review` /
    `/opsx:verify` will break; we control the only ones.
- **Migration**:
  - `agents.yaml` schema unchanged — `roles: [code, review,
    manager]` entries keep working; `roles: [propose]` / `roles:
    [verify]` become newly valid.
  - No config change users need to make.
