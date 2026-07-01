---
status: shaped
tags: [feature/task-assignment, feature/kanban, area/web, area/server]
source: conversation
related:
  - docs/ideas/2026-06-23-cross-cutting-tags.md
promoted_to: null
---

# Task / change assignment

The Kanban board (see `add-kanban-view`) maps the OpenSpec workflow to
TODO / IN-PROGRESS / DONE columns. The natural next step is **who** is responsible
for moving each change forward — assignment. This file captures the direction
agreed during the kanban design conversation; it is explicitly NOT in
`add-kanban-view` so that change stays focused.

## When assignment is set

At **propose time**. The "+ New Change" modal grows an optional Assignee field
(empty = unassigned, "pool" column behavior). Assignment can be edited later
via the Kanban card itself, but the natural moment is the same gesture that
brings the change into existence.

## Two flavors that share a model

| flavor | what it is | how it interacts with the system |
|---|---|---|
| **agent** (e.g. `@claude`, `@cursor`) | An LLM that runs in a worktree to implement the change | Drag TODO → IN-PROGRESS triggers `git worktree add` + agent spawn via the existing `/api/pty/inject` |
| **human** (e.g. `@fluentdb-dev`) | A person responsible for the change | Label only — used for filtering ("show my changes"), avatar on cards |

Both share the same `assignees: [<mention>...]` shape. The interpretation —
spawn a worktree or just display a badge — is decided by a simple prefix
convention (`@claude*`, `@gpt*`, `@cursor*` → agent; everything else → human)
or by a small registry.

## Storage

Assignees live in the change proposal's frontmatter:

```yaml
---
tags: [...]
assignees: ['@claude']
---
```

Reasons:

- One file (proposal.md) carries all the change-level metadata already.
- The dashboard already parses proposal frontmatter (tags landed in
  `add-cross-cutting-tags`).
- No sidecar JSON to sync.
- Surgical edit of tasks.md is unaffected.

Per-task assignment (one task within a change goes to `@claude`, another to
`@gpt`) is a future refinement. v1 is per-change only — simpler and covers
the dominant case.

## Agent invocation (the agentic flavor)

When a TODO card with `@claude` is dragged into IN-PROGRESS:

```
git worktree add ../<change-id> -b change/<change-id>
cd ../<change-id> && claude  # or some headless invocation
# inside that session:
/opsx:apply <change-id>
```

All injected into the active terminal via the existing inject endpoint. The
dashboard does NOT spawn processes itself — same boundary as
`add-ui-orchestration`.

The agent finishes by checking tasks off in tasks.md (Watcher reflects it
back) and writes an `outcome.md` before archive.

## Human invocation (the label flavor)

Display only:

- Card shows a small avatar / chip (`@fluentdb-dev`).
- Tags page can be filtered by assignee (or there's a `/assignees` page).
- No automation; the user just knows it's theirs.

## Mention syntax

`@<name>` — required prefix. No spaces. Helps the parser distinguish from
free-form metadata and matches the GitHub mental model.

## Open questions

- How does the dashboard know whether `@foo` is an agent or a human?
  - v1 candidate: a tiny `assignees.json` (or YAML) at project root mapping
    `name → kind` plus optional spawn command. Defaults: any name in a
    fixed agent list (`claude`, `gpt`, `cursor`, …) is agent.
- Multiple assignees on one change? Supported in the schema (`assignees`
  is a list), but the agent-spawn case probably picks the first agent
  assignee. Multi-agent collab is its own can of worms.
- Reassigning a change mid-flight: edit the proposal frontmatter. The
  dashboard should reflect this live via the existing watcher.

## Future changes that this would split into

- `add-agent-assignment` — schema + spawn-via-inject for agent flavor
- `add-user-assignment` — schema + filter/badge for human flavor
- Or unified: `add-change-assignment` covering both

The split is a sequencing choice; the schema is the same.

## Update (2026-06-25): UI-triggered implementation pipeline

The agent-side direction has crystallized into a three-MVP staircase. The
"agent assignment" concept above splits into:

| step | change | scope |
|---|---|---|
| **MVP-1** | `add-agent-runner` | `agents.yaml` registry, `git worktree` spawn per change, single agent per change with a lock, stdout/stderr tail over WS, manual merge via PTY inject |
| **MVP-2** | `add-multi-role-pipeline` | Multiple roles per change (implement → test → review) running sequentially or in parallel, role definitions in the same `agents.yaml` |
| **MVP-3** | `add-task-level-assignment` | Per-task assignment within a change, tasks dispatched to different agents in parallel |

The original idea (assignment as proposal-time metadata) stays intact — it
becomes how the UI knows which agent to run. The pipeline above is *how*
the agent gets executed.

### Worktree placement (v1)

- Path: `.worktrees/<change-id>/` at the project root (plural, dotfile,
  one per change).
- Added to `.gitignore` as part of `add-agent-runner`.
- Branch: `agent/<change-id>`.
- Lifecycle: server creates with `git worktree add`; the user merges and
  cleans up via UI buttons that inject `git merge` / `git worktree remove`
  into the embedded terminal (same pattern as `add-ui-orchestration`).

### Spawn vs SDK

v1 uses `child_process.spawn` directly. This keeps the server in control of
lifetime, supports any local CLI tool (claude, aider, custom), and avoids
the Anthropic-API-key tax. Agent SDK integration is a future change.

### Concurrency model (v1)

In-memory `change-id → jobId` lock. Second `Run` on the same change returns
`409 Conflict` with the active job id. Different changes run in parallel.
Lock is process-local; lost on server restart (acceptable — the worktree
stays on disk so manual recovery is straightforward).

## Update (2026-07-01): unified action + execution mode in proposal frontmatter

The dashboard shipped **two similar-looking actions** for the same intent:

- **Drag TODO → IN-PROGRESS**: injects `/opsx:apply <id>` into the
  embedded terminal (existing session, main working tree)
- **Run button**: spawns an agent in `.worktrees/<id>/` via
  `child_process.spawn`

That split confused users. The unification is: **one action, decided at
planning time.**

### Proposal frontmatter gains an `execution` field

```yaml
---
tags: [feature/x, area/y]
assignees: ['@claude']
execution: worktree      # or: terminal
---
```

`execution` values:

- `worktree` — the Run/spawn path (isolated worktree, parallelizable).
- `terminal` — the Apply/inject path (existing session, single-track).
- Unset — the UI shows a picker so the user chooses per action, and can
  save the choice back to the frontmatter via a "remember" checkbox.

### Unified action semantics

- **Drag TODO → IN-PROGRESS** and **Click the card's start action** are
  the same handler. Removing the semantic split removes the mental model
  overhead.
- The client reads `change.proposal.execution`. If set, dispatch
  directly (worktree spawn or terminal inject). If unset, open the
  picker.
- The preview modal for the worktree path shows the `git worktree add …`
  command about to run so the user still sees what the server will do.

### CLI mode interaction

- **terminal mode** honours the existing Claude / CLI command style
  toggle (Apply has no CLI equivalent, so CLI + terminal disables the
  action — same as today's Drag behavior).
- **worktree mode** ignores the command style toggle because the agent
  runs its own command (from `agents.yaml`); there's no `/opsx:*` in the
  loop.

### Where this connects to task-assignment

`execution:` and `assignees:` are independent axes: an
`assignees: ['@fluentdb-dev']` (a human) with `execution: terminal` means
"the person's own terminal session"; `assignees: ['@claude']` with
`execution: worktree` means "spawn an agent." The picker's default when
`execution` is unset can be inferred from the assignee prefix in a
future refinement (`@claude*` → worktree by default), but v1 keeps
the axes explicit.
