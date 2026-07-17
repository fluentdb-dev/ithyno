# Delta: dashboard — folder-driven placement + concurrency semaphore

## ADDED Requirements

### Requirement: Kanban Placement Is Folder-Driven

The Kanban `bucketize` algorithm SHALL classify each change into
TODO / IN-PROGRESS / DONE using **filesystem state only**, without
consulting the in-memory job registry. Placement order (first match
wins):

1. If `openspec/changes/archive/*-<change-id>/` exists → **DONE**.
2. If `.worktrees/<change-id>/openspec/changes/<change-id>/tasks.md`
   exists AND all its checkboxes are ticked → **DONE**.
3. If `.worktrees/<change-id>/` exists → **IN-PROGRESS**.
4. If main-tree `openspec/changes/<change-id>/tasks.md` exists AND
   all checkboxes are ticked → **DONE**.
5. If main-tree progress `done > 0` → **IN-PROGRESS**.
6. Else → **TODO**.

The dashboard SHALL read a change `X`'s progress from
`.worktrees/X/openspec/changes/X/tasks.md` when the worktree exists,
otherwise from main-tree `openspec/changes/X/tasks.md`. The
dashboard SHALL NOT read change `X`'s tasks.md from a different
change's worktree (`.worktrees/Y/openspec/changes/X/tasks.md`) —
that copy is frozen at the time `Y`'s worktree was created and does
not reflect `X`'s live state.

Placement decisions SHALL use `fs.stat` and `fs.readFile` only —
NOT `git status`, `git log`, or any other subprocess-git call —
because git subprocess overhead compounds across cards on every
render.

Live updates SHALL propagate via a chokidar watcher over the
`.worktrees/*/openspec/changes/*/tasks.md` glob. On tasks.md
change, the server SHALL emit a `worktree-progress-updated` WS
event carrying the new progress; the store applies it to the
matching `Change`'s `worktree.tasksProgress`.

#### Scenario: worktree exists → IN-PROGRESS
- **GIVEN** `.worktrees/add-dummy-tab/` exists but not all tasks are ticked in its tasks.md
- **WHEN** the Kanban renders
- **THEN** the `add-dummy-tab` card appears in the IN-PROGRESS column

#### Scenario: worktree all-done → DONE
- **GIVEN** `.worktrees/add-dummy-tab/openspec/changes/add-dummy-tab/tasks.md` has every checkbox ticked
- **WHEN** the Kanban renders
- **THEN** the card appears in the DONE column

#### Scenario: worktree missing, main-tree partial → IN-PROGRESS
- **GIVEN** no `.worktrees/add-dummy-tab/`, main-tree tasks.md has 5/10 ticked
- **WHEN** the Kanban renders
- **THEN** the card appears in the IN-PROGRESS column

#### Scenario: no worktree, main-tree untouched → TODO
- **GIVEN** no `.worktrees/add-dummy-tab/`, main-tree tasks.md has 0/10 ticked
- **WHEN** the Kanban renders
- **THEN** the card appears in the TODO column

#### Scenario: archived → DONE
- **GIVEN** `openspec/changes/archive/2026-07-17-add-dummy-tab/` exists
- **WHEN** the Kanban renders
- **THEN** the card appears in the DONE column (archive short-circuits earlier checks)

#### Scenario: X's progress not read from Y's worktree
- **GIVEN** a change X with no worktree, and a different change Y whose worktree at `.worktrees/Y/openspec/changes/X/tasks.md` contains stale X data
- **WHEN** the dashboard resolves X's progress
- **THEN** it reads main-tree `openspec/changes/X/tasks.md` — not the frozen copy inside Y's worktree

#### Scenario: chokidar-driven live progress updates
- **GIVEN** the server is watching `.worktrees/*/openspec/changes/*/tasks.md`
- **WHEN** a task checkbox is flipped in `.worktrees/add-dummy-tab/openspec/changes/add-dummy-tab/tasks.md`
- **THEN** the server emits a `worktree-progress-updated` WS event; the client's `Change.worktree.tasksProgress` updates without a full state refetch

#### Scenario: no git subprocess in bucketize
- **GIVEN** N changes rendered in Kanban
- **WHEN** bucketize runs on each
- **THEN** no `git status`, `git log`, or other git subprocess is invoked; only `fs.stat` and (cached) tasks.md reads happen

### Requirement: Worktree Concurrency Semaphore

The system SHALL maintain a semaphore file at `.worktrees/.lock`
that gates concurrent dispatch when `agents.yaml.parallelExecution
=== false`. When `parallelExecution` is `true` (or absent, treated
as `false` per `add-parallel-execution-config`), the lock still
exists conceptually but does not prevent dispatch.

Wait — actually the lock's role is exclusively for the
`parallelExecution: false` case (single-tenant). When
`parallelExecution: true`, no lock is acquired or checked. This
requirement documents the `false` case.

**File format** (YAML):
```yaml
change: <change-id>
acquiredAt: <ISO-8601 timestamp>
pid: null | <process-id>
```

`pid` is `null` when the dispatcher spawned workers via Task tool
(no owning process), populated with the dispatcher's own PID when
the dispatcher runs as a subprocess (future-proof).

**Acquire** (dispatcher's step 4 worktree bootstrap, only when
`parallelExecution: false`):

1. Read `.worktrees/.lock`. If it does not exist → write the lock
   (change = current change id, acquiredAt = now, pid = null) and
   proceed to worktree setup.
2. If it exists:
   - Read its `change` field. If `.worktrees/<change>/` exists →
     escalate: `Another change (<held-change>) is currently
     running. Merge or discard it before starting another.`. Do NOT
     proceed with worktree setup.
   - If `.worktrees/<held-change>/` is missing → treat as **stale**,
     delete the lock, then write a fresh lock for the current
     change and proceed.

**Release** — three paths:

1. Dispatcher step 7 verify pass (phase → done) — delete the lock.
2. Any dispatcher escalate path — delete the lock (the dispatcher
   is done with this change, regardless of outcome).
3. Kanban's Merge / Discard action — after `git worktree remove` +
   `git branch -D` succeeds, if `.worktrees/.lock`'s `change` field
   matches the change being merged/discarded, delete the lock.

**Startup cleanup**: on server boot, read `.worktrees/.lock`. If it
exists but `.worktrees/<lock.change>/` does not, delete the lock
(stale from a previous crash).

The server SHALL expose the lock state via workspace state (`state.
lock: { change, acquiredAt } | null`) and broadcast a `lock-updated`
WS event when it changes.

#### Scenario: parallelExecution false, first dispatch acquires lock
- **GIVEN** `parallelExecution: false` and no `.worktrees/.lock`
- **WHEN** the dispatcher runs for `change-A`
- **THEN** the dispatcher writes `.worktrees/.lock` with `change: change-A` and proceeds to worktree setup

#### Scenario: parallelExecution false, second dispatch blocked
- **GIVEN** `parallelExecution: false` and `.worktrees/.lock` exists with `change: change-A`, `.worktrees/change-A/` exists
- **WHEN** the dispatcher runs for `change-B`
- **THEN** the dispatcher escalates with `Another change (change-A) is currently running. Merge or discard it before starting another.` and does NOT create `.worktrees/change-B/`

#### Scenario: stale lock (worktree missing) auto-cleared
- **GIVEN** `.worktrees/.lock` exists with `change: change-A` but `.worktrees/change-A/` does not exist
- **WHEN** the dispatcher runs for `change-B` (or any change)
- **THEN** the dispatcher deletes the stale lock, writes a fresh lock for the current change, and proceeds

#### Scenario: dispatch complete releases lock
- **GIVEN** the dispatcher is at step 7 with verify verdict `pass`
- **WHEN** the dispatcher posts `phase: done`
- **THEN** it deletes `.worktrees/.lock` before exiting

#### Scenario: dispatch escalation releases lock
- **GIVEN** the dispatcher escalates (any reason: worker failure, missing artifact, MAX_ITERATIONS)
- **WHEN** the escalation completes
- **THEN** `.worktrees/.lock` is deleted before the dispatcher exits

#### Scenario: Kanban merge/discard releases lock
- **GIVEN** `.worktrees/.lock` holds `change: change-A` and the user clicks Merge or Discard on change-A's card
- **WHEN** the merge/discard action completes (`git worktree remove` + `git branch -D`)
- **THEN** `.worktrees/.lock` is deleted

#### Scenario: server startup clears stale lock
- **GIVEN** server crashes with `.worktrees/.lock` set to `change: change-A` but `.worktrees/change-A/` was manually deleted
- **WHEN** the server restarts
- **THEN** startup routine detects the missing worktree and deletes the lock; `state.lock` broadcasts as `null`

#### Scenario: parallelExecution true — lock ignored
- **GIVEN** `parallelExecution: true`
- **WHEN** the dispatcher runs for any change
- **THEN** the lock file is not consulted (may or may not exist; irrelevant); multiple worktrees may exist concurrently

## MODIFIED Requirements

### Requirement: Dispatch Slash Command

The `/ithy-opsx:dispatch <change-id>` slash command SHALL exist as a
prompt template at `.claude/commands/ithy-opsx/dispatch.md`. It is
evaluated by the persistent Manager (a `claude` live-shell session
declared in `agents.yaml` with `roles: [manager]`) when the Kanban
Start button injects the string into the terminal PTY.

The skill SHALL:

1. Read `agents.yaml` top-level `parallelExecution: boolean` (default
   `false`) and the change's `proposal.md` frontmatter `execution:`
   override (`worktree` / `terminal`). Priority: per-change override
   > `parallelExecution` config > default `false`.
2. When the resolved mode is worktree: ensure `.worktrees/<change-id>/`
   exists (`git worktree add -b agent/<change-id>
   .worktrees/<change-id> HEAD`, guarded by `if [ ! -d ]` for
   idempotence). All subsequent worker invocations run with that
   worktree as `cwd`.
3. **When `parallelExecution === false`, before creating the worktree
   in step 2 above, acquire the `.worktrees/.lock` semaphore per the
   `Worktree Concurrency Semaphore` requirement.** If the lock is
   held by another change whose worktree still exists, escalate
   without creating a worktree.
4. Advance the change through `proposed → coded → reviewed → done`
   by dispatching workers in stages (code → review → verify), using
   the Dispatch helper protocol (Task tool for `command == "claude"`,
   subprocess `-p` otherwise) and the 3-stage success contract for
   review/verify (subprocess exit / review.md existence / verdict).
5. On verify `pass` (phase → done), release the `.worktrees/.lock`
   semaphore.
6. On any escalate path, release the `.worktrees/.lock` semaphore
   before exiting.

MAX_ITERATIONS remains 5 for the code↔review loop. All other
existing behavior from the previous Dispatch Slash Command spec is
retained.

#### Scenario: parallelExecution false — lock acquired before worktree
- **GIVEN** `parallelExecution: false` and no `.worktrees/.lock`
- **WHEN** the dispatcher runs for `change-A`
- **THEN** it writes the lock first, then creates `.worktrees/change-A/`

#### Scenario: parallelExecution false — lock held blocks dispatch
- **GIVEN** `parallelExecution: false` and `.worktrees/.lock` held by `change-A` with `.worktrees/change-A/` present
- **WHEN** the dispatcher runs for `change-B`
- **THEN** the dispatcher escalates with `Another change (change-A) is currently running.` and no `.worktrees/change-B/` is created

#### Scenario: verify pass releases lock
- **GIVEN** the dispatcher completes verify with `verdict: pass` under `parallelExecution: false`
- **WHEN** phase transitions to done
- **THEN** `.worktrees/.lock` is deleted

#### Scenario: escalation releases lock
- **GIVEN** the dispatcher escalates for any reason under `parallelExecution: false`
- **WHEN** the escalation runs
- **THEN** `.worktrees/.lock` is deleted before exit

### Requirement: Start Flow Delegates Execution To Skill Layer

The Kanban Start button and the ChangeDetail Start button SHALL
inject `/ithy-opsx:dispatch <change-id>` into the embedded terminal
without opening any picker, agent-selection modal, or worktree spawn
from the UI. The UI SHALL NOT read `parallelExecution` to make its
own execution-mode decision — that lives in the skill layer.

**Lock-based gate** (new): the UI SHALL read `state.lock`
(broadcast by the server) and, when `parallelExecution === false`
AND the lock is held by a different change than the one being
started, gate the Start button:

- The Start button is disabled with tooltip `Change <held-change> is
  currently running. Merge or discard it first.`
- No inject happens on click.

When the lock is held by the same change being started, the Start
button acts as an **Attach**: it re-injects `/ithy-opsx:dispatch
<change-id>` (the dispatcher is idempotent — it re-enters at the
current phase per its restart-recovery guarantee).

The UI SHALL NOT gate on `agents.yaml` contents beyond the lock.
Empty agents.yaml is handled by the dispatcher's Manager fallback
(no UI gate needed).

Only one prerequisite failure SHALL surface as a toast notification
from the UI: embedded terminal unavailable → `No embedded terminal
— open a change view to spawn one`.

#### Scenario: Start injects dispatch invocation
- **GIVEN** the embedded terminal is available, `parallelExecution: true`, and no lock held
- **WHEN** the user clicks Start on `change-A`
- **THEN** the flow injects `/ithy-opsx:dispatch change-A` into the terminal

#### Scenario: parallelExecution false, no lock — normal dispatch
- **GIVEN** `parallelExecution: false` and no lock held
- **WHEN** the user clicks Start on `change-A`
- **THEN** the flow injects normally; the dispatcher will acquire the lock during its own execution

#### Scenario: parallelExecution false, lock held by another change — Start disabled
- **GIVEN** `parallelExecution: false` and `state.lock: { change: "change-A" }`
- **WHEN** the user views `change-B`'s Start button
- **THEN** the button is disabled with tooltip `Change change-A is currently running. Merge or discard it first.`

#### Scenario: parallelExecution false, lock held by same change — Attach
- **GIVEN** `parallelExecution: false` and `state.lock: { change: "change-A" }`
- **WHEN** the user clicks Start on `change-A` again (e.g., after PTY died)
- **THEN** the flow re-injects `/ithy-opsx:dispatch change-A`; the dispatcher's restart-recovery detects the current phase and continues from there

#### Scenario: no embedded terminal surfaces as toast
- **GIVEN** the embedded terminal is unavailable
- **WHEN** the user clicks Start
- **THEN** a toast reports "No embedded terminal — open a change view to spawn one" and no injection occurs

#### Scenario: empty agents.yaml does not gate UI
- **GIVEN** `agents.yaml` empty (`agents: []`)
- **WHEN** the user clicks Start
- **THEN** the UI still injects `/ithy-opsx:dispatch <id>` — the dispatcher resolves the fallback to Manager self-dispatch
