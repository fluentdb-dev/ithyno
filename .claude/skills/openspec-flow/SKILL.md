---
name: openspec-flow
description: The project's spec-driven workflow for ithyno. Use this BEFORE implementing any spec-level change — to decide whether a change proposal is needed and to run the propose → validate → implement → archive loop. This is a project-local skill that composes with the OpenSpec-installed skills (openspec-propose, openspec-apply-change, openspec-archive-change).
license: MIT
---

# OpenSpec workflow for this project

This repo is **dogfooded with OpenSpec**: every spec-level change goes through a
proposal, gets validated, is implemented against a tasks checklist, and is then
archived (which merges the delta into the current specs). The dashboard's
embedded terminal is the execution surface; Claude Code in that terminal is the
agent.

This skill captures the project rules so the loop is followed consistently. Read
this BEFORE writing code in response to "add X" / "change behavior of Y" style
requests.

---

## Decision: does this need a change proposal?

| Type of work | Proposal? |
|---|---|
| New feature, new capability | ✅ Yes |
| Observable behavior change (e.g. "preference now persists") | ✅ Yes |
| Public API or contract change | ✅ Yes |
| Obvious bug fix (reason: bug, not decision) | ❌ No |
| Internal refactor / rename / dead-code removal | ❌ No |
| Typo, comment, docs-only tweak | ❌ No |
| Tests added for existing behavior | ❌ No |

Rule of thumb: if you would want the spec.md to change to describe what the
system does after this work, write a proposal first. Otherwise just implement.

If you skipped this and only realized mid-implementation that it is spec-level,
stop and propose now (or retrofit a change after the fact — see "Retrofit"
below). Do NOT keep shipping spec-level changes without a record.

---

## Standard loop

```
        ┌── once per change ──────────────────────────────┐
        │                                                  │
   ① Propose      → openspec/changes/<id>/ artifacts       │
   ② Validate     → openspec validate <id>                 │
   ③ Implement    → edit code, tick tasks in tasks.md      │
   ④ Verify       → tests, manual checks                   │
   ⑤ Archive      → moves to archive/, merges delta specs  │
        │                                                  │
        └──────────────────────────────────────────────────┘
```

### ① Propose

Pick the right entry point:

- **AI-assisted (preferred for non-trivial proposals):** in the embedded
  terminal, type `/opsx:propose "<one-line description>"`. The skill installed
  by `openspec init` derives a kebab-case id, scaffolds the change directory,
  and fills in all four artifacts using the official templates.
- **CLI scaffold + hand-write:** when you already know exactly what to write,
  `npx openspec new change <id>` creates the dir; then fill in by hand.

Every change must end up with four artifacts:

```
openspec/changes/<id>/
├── proposal.md   ## Why / ## What Changes / ## Capabilities / ## Impact
├── design.md     ## Context / ## Goals / Non-Goals / ## Decisions / ## Risks
├── specs/<capability>/spec.md   ## ADDED|MODIFIED|REMOVED Requirements
└── tasks.md      ## N. Group → - [ ] N.M task
```

Conventions specific to this project:
- `## Capabilities` in proposal.md lists `New` and `Modified` capability names
  (kebab-case). Each becomes a directory under `specs/`.
- Spec deltas use `## ADDED Requirements` / `## MODIFIED Requirements` /
  `## REMOVED Requirements` (no wrapping `## Requirements` heading in deltas —
  that heading only appears in **main** specs under `openspec/specs/`).
- Scenarios use bold keywords: `- **WHEN** ...` / `- **THEN** ...` (and
  optionally `**GIVEN**`).
- Tasks use hierarchical numbering (`1`, `1.1`, `1.2`, `2`, ...) under `## N.`
  group headings.

### ② Validate

```
npx openspec validate <id>
npx openspec validate --all   # before merging anything significant
```

If a main spec validation complains about a missing `## Requirements` section,
add the heading directly under `## Purpose` (it wraps the `### Requirement:`
blocks in **main** specs, not in deltas).

### ③ Implement

Pick task 1.1 first, work top-down. Tick checkboxes as you go — either:

- In the dashboard (click the checkbox; the server surgically rewrites the line).
- Or by `sed`/edit if you are working in the terminal.

The dashboard reflects progress live via the watcher, which is the whole point.

For larger work, `/opsx:apply <id>` in the terminal hands the task list to
Claude Code, which will tick items as it completes them.

### ④ Verify

Before archiving, run this project's verification commands (tests, type
check, build — whatever applies here), plus:

```
npx openspec validate --all
```

For UI-affecting changes, also start this project's dev server and exercise
the feature in the browser. Don't claim completion without seeing the
behavior.

### ⑤ Archive

Before archiving, write an `outcome.md` that captures what was learned. The
outcome is the project's primary feedback channel from implementation back
into the docs space — without it, hard-won lessons evaporate.

#### Outcome template

Put the file at `openspec/changes/<id>/outcome.md` (it migrates with the
change folder during archive). Free-form Markdown, with four suggested
sections:

```markdown
## ✅ What worked
- Design decisions that paid off.

## ⚠️ What surprised us
- Pleasant or painful surprises during implementation.

## 🔁 What we'd do differently
- Concrete revisions for next time.

## 🌱 Follow-ups
- Seeds for future changes / open questions / things deferred.
```

Sections can be brief. Skip what does not apply. The point is honesty about
the experience, not completeness.

#### Archive command

```
npx openspec archive <id>
# or in the terminal:
/opsx:archive <id>
```

This moves the change folder to `openspec/changes/archive/<date>-<id>/` and
merges the delta specs into `openspec/specs/`. `outcome.md` travels with the
folder and the dashboard renders it on the Archived panel.

The full history (why / how / what was done / **what we learned**) is
preserved in archive.

---

## Retrofit (when implementation happened first)

If a spec-level change slipped through and got implemented without a proposal:

1. Create the change directory: `npx openspec new change <id>`.
2. Write the four artifacts to **describe what is now true**. Mark tasks already
   done as `[x]` because the work is complete.
3. Validate.
4. Archive immediately, so the delta merges into main specs and the record exists.

Do NOT pretend the work hadn't happened — the artifacts should reflect the
shipped behavior. The point of retrofitting is to make the spec record honest
again, not to relitigate decisions.

---

## In-flight pivot (when the change you're holding needs to be re-thought)

Sometimes mid-conversation a proposed change reveals itself as the wrong shape
— the same name still fits, but the underlying problem or capability has
shifted. The rules below keep the archive history honest without making
iteration painful.

| situation | correct move |
|---|---|
| Implementation has started or shipped on this change | **Do NOT rewrite.** Create a new change for the new direction. The old change documents what was actually built. Modifying its proposal/design/spec retroactively rewrites history. |
| 0 implementation, **refinement of the same intent** (e.g. "Apply button gains a badge" → "Apply button gains a badge with color") | **Edit in place.** Update proposal/design/spec/tasks, re-validate. The change name and capability target are unchanged. |
| 0 implementation, **scope expansion within the same intent** | **Edit in place, additive only.** Append new tasks/specs; do not modify existing checked items. Re-validate. |
| 0 implementation, **pivot to a different problem or capability shape** | **Drop + new.** Mark the original `status: dropped` (or delete it) and capture a one-paragraph note as a `docs/ideas/` entry recording the original intent. Create a fresh change with the new direction. The decision trail stays readable. |

Smell tests for "is this a pivot?":

- Does the new direction modify a different capability?
- Does the new direction change what user-visible problem is being solved?
- Would a reader of just the new proposal be confused that the old artifacts
  match its name?

If yes to any, treat it as a pivot — drop + new is cheap and keeps the
archive honest.

When uncertain, ask the user once: "is this a refinement or a pivot?" The
answer determines the procedure.

## Common pitfalls

- **Implementing before proposing.** Easy to slip into for "small" UX changes
  that are actually spec-level (e.g. "preference persists across sessions").
  When in doubt, ask the user once: "is this spec-level or trivial?"
- **Forgetting deltas have no `## Requirements` wrapper.** Main specs need it;
  deltas use `## ADDED Requirements` directly. Validate after writing.
- **Tasks that are too coarse.** Each task should be testable on its own.
  Prefer 6–12 leaf tasks per change over 3 mega-tasks.
- **Skipping `npx openspec validate --all` after an archive.** The merge
  can introduce duplicate requirement names; validate catches it.

---

## Idea capture (stage ①, before a proposal exists)

OpenSpec covers stage ③ onward (proposal / design / specs / tasks). This
project also tracks the **idea stage** that precedes a formal change proposal,
so design-conversation insight does not vanish when the conversation ends.

### Location and naming

```
docs/ideas/YYYY-MM-DD-<kebab-topic>.md
```

with frontmatter:

```yaml
---
status: idea            # idea | exploring | shaped | promoted | dropped
tags: [feature/x, area/y]   # cross-cutting tags
source: conversation    # conversation | brainstorm | research | explore
related: []             # paths to related ideas / docs / changes
promoted_to: null       # set when graduated to a doc or openspec change
---
```

### When to capture (capture habit)

At the end of any design conversation that produces a conclusion worth keeping
but NOT yet a formal change proposal — for example, an architectural sketch,
a decided naming convention, or a "future work" placeholder — write the
conclusion to `docs/ideas/` before ending the turn. One file per topic, named
as a noun phrase (`staged-docs.md`, not `thinking-about-docs.md`).

Trigger checklist: write an idea note when any of these is true:

- The conversation produced a clear stance on a design question that does not
  yet have a change to belong to.
- The user asked a strategic question and accepted a recommendation that will
  inform future changes.
- A "future work" reference would otherwise live only in chat history.

### Promotion (idea → docs / spec)

Ideas are **never deleted**. When an idea graduates, edit the frontmatter:

```yaml
status: promoted
promoted_to: openspec/changes/add-x/   # or docs/architecture.md, etc.
```

The historical trail stays intact; any spec or doc can be traced back to the
conversation that spawned it. If an idea is abandoned, set `status: dropped`
and add a short note explaining why.

### Returning to a topic

When the same topic returns in a later conversation, update the existing file
in place (preferred), or create a `-v2.md` companion if the new direction
contradicts the earlier one.

## Picking tags

Tags live in markdown frontmatter — `tags: [feature/x, area/y]` — on ideas,
docs, change proposals, archive outcomes, and (later) code annotations. The
dashboard's Tags page aggregates them across stages. There is no central
registry; vocabulary emerges from usage. To keep the index useful, follow
these rules whenever you write or accept a markdown file with tags:

1. **Reuse before invent.** Open `/tags` first. If a near-match exists
   (`feature/embedded-terminal` vs the new `feature/terminal`), reuse the
   existing one.
2. **Strict namespace.** The recognized namespaces are `feature/`, `screen/`,
   `area/`, `role/`, `stage/`. Pick the one that fits — do not invent new
   prefixes lightly. Tags with no `/` go to the synthetic `other/` bucket;
   prefer prefixed forms.
3. **Kebab-case names.** `feature/embedded-terminal`, not
   `feature/Embedded-Terminal` or `feature/embeddedTerminal`.
4. **1 to 4 tags per file.** One tag is the floor (a single most-relevant
   feature or area). More than four usually means the file is doing too many
   things; consider splitting.
5. **Multiple namespaces are fine on one file.** A docs page about the kanban
   UI might carry `feature/kanban` and `screen/change-detail` together — the
   tag pages then surface it under both.
6. **No editorial verdicts.** Tags describe *what the artifact is about*, not
   *what we think of it* (`feature/important`, `stage/idea` describing
   maturity is fine; `feature/bug-prone` is not).

## Agent runner (MVP-1)

The dashboard can spawn agents that implement a change in an isolated git
worktree. This is the first step of the assignment pipeline; per-task
assignment and multi-role pipelines come in follow-up changes.

### Agent registry: `agents.yaml`

```yaml
agents:
  - name: claude
    description: Implements the change using Claude Code via /opsx:apply.
    command: claude
    args: ["/opsx:apply", "${change_id}"]
```

Template variables in `args` / `env`: `${change_id}`, `${worktree_path}`,
`${branch}`. The file is auto-reloaded; missing or malformed registry hides
the Run button rather than breaking the dashboard.

### Run → Merge → Discard cycle

1. Click **Run** on a TODO or IN-PROGRESS kanban card. The server creates
   `.worktrees/<change-id>/` on branch `agent/<change-id>` and spawns the
   agent there.
2. Watch live output on `/agents` (also surfaced as a status badge on the
   card).
3. When the agent finishes, the card shows **Ready**. Click **Merge** — a
   modal previews `git merge --no-ff agent/<change-id>` and sends it to the
   embedded terminal. Review git output there.
4. If the agent's work is unwanted, click **Discard** — the modal previews
   the worktree+branch cleanup, again sent through the terminal.

### One job per change

The server holds a `change-id → jobId` lock. A second Run on the same
change while another job is active returns 409. Different changes run
agents in parallel.

### Worktree placement

- Path: `.worktrees/<change-id>/` at project root.
- Already added to `.gitignore`.
- Branch: `agent/<change-id>`.

## Commands cheat-sheet

```bash
# Scaffold
npx openspec new change <id>

# Inspect
npx openspec list
npx openspec status --change <id>
npx openspec status --change <id> --json   # to get artifact templates programmatically

# Validate
npx openspec validate <id>
npx openspec validate --all

# Archive (merges delta into main specs)
npx openspec archive <id>

# In the embedded terminal (Claude Code)
/opsx:propose "<description>"
/opsx:apply <id>
/opsx:archive <id>
/opsx:sync <id>
```

---

## Revert

Reverting a past change is a first-class workflow variant. It has
its own naming convention and disposition rules, formalized by
`add-revert-workflow`.

### PENDING annotation (Hard rule for MODIFIED / REMOVED deltas)

At **propose time** for any change carrying a MODIFIED or REMOVED
delta against a landed requirement, insert a one-line notice **after
the SHALL/MUST body paragraph** (before any `#### Scenario:` header)
of that requirement in the current
`openspec/specs/<capability>/spec.md`:

```md
### Requirement: <name>

<existing SHALL/MUST body paragraph — must stay first non-empty line>

> ⚠️ **PENDING <ADDED|MODIFIED|REMOVED>** by [<change-id>](../../changes/<change-id>/): <一行理由>.

<remaining body / #### Scenario: blocks>
```

**Why after the body, not directly under the heading**: the openspec
CLI parser (`parseRequirements`) captures the FIRST non-empty line
after the header as `text`, and `RequirementSchema` requires that line
to contain SHALL/MUST. The annotation in the pre-body slot swallows
the check and breaks `openspec archive` for unrelated changes on the
same capability. See `fix-pending-annotation-parser-compat`.

Rationale: between propose and archive the spec still shows the
requirement as if it were authoritative. Any agent / session reading
the spec in that window follows the doomed requirement without
seeing the pending revert. The annotation vanishes automatically at
archive time (REMOVED requirement disappears; MODIFIED requirement
gets its body replaced from the delta).

Not needed for pure ADDED (the requirement does not yet exist in
the current spec). Also not needed for changes that only touch
non-spec artifacts (impl, tests, docs).

### Naming

- Revert change id: `revert-<scope>` where scope names the
  reverted behavior (not necessarily every target id). Examples:
  `revert-agent-pty-layers` reverts three siblings under one scope
  name.
- `tags:` frontmatter includes `feature/revert`.
- Proposal's **Why** section lists every reverted target by id and
  classifies each as Case α or Case β.

### Case α — target already archived when the revert lands

- Target's ADDED spec deltas have reached
  `openspec/specs/<capability>/spec.md`.
- Revert change's spec delta uses `MODIFIED` and/or `REMOVED` to
  undo those requirements.
- Target archive stays put; revert's outcome links back to it.

### Case β — target still in-flight when the revert lands

- Target's ADDED spec deltas never reached specs.
- Revert change's spec delta uses `ADDED` only, describing the
  post-revert baseline directly.
- Target itself is archived alongside the revert (see below).

A single revert may have targets in both cases.

### Reverted-target archive (Case β)

For each in-flight target being wrapped up by a revert:

1. **Delete** `openspec/changes/<target>/specs/`. Its ADDED deltas
   would collide with the revert's own baseline in the capability
   spec if applied.
2. **Write** `openspec/changes/<target>/outcome.md`:
   - Title: `# Outcome: <target-id> (reverted)`
   - Preserve `## ✅ Worked` and `## ⚠️ Surprises` from the actual
     implementation — history is honest about what was tried.
   - Replace `## 🔁 Differently` and `## 🌱 Follow-ups` with a
     single bold line pointing at the reverting change id:
     `**Reverted by [<revert-id>](../archive/<date>-<revert-id>/).**`
3. **Archive**: `openspec archive <target-id> --yes` (or via
   `/ithy-opsx:archive`).
4. **Commit**: `archive: <target-id> (reverted)`.
5. **Ordering**: archive all reverted targets BEFORE archiving the
   reverting change itself. The revert's archive commit lands
   last so the Kanban and archive tree reflect the revert as the
   terminal state.

### Cross-references

- `CLAUDE.md` Standard order cross-references this section.
- `add-revert-workflow` codified these rules; see its proposal for
  the design rationale.
