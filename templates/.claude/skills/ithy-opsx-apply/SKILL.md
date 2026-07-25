---
name: ithy-opsx-apply
description: Implement an OpenSpec change and end by committing the work on the current branch. Wraps `/opsx:apply` and adds a "commit before you stop" step so worktree agents leave the agent branch with a proper implementation commit rather than a dirty tree. Used as the default `agents.yaml` initialInput for the bundled Claude agent.
license: MIT
---

# `/ithy-opsx:apply <change-id>` — implement, then commit

This skill is the recipe Claude runs when the user (or the agent
runner) asks it to implement an OpenSpec change. It delegates the
actual implementation to `/opsx:apply` and adds one thing: **a git
commit at the end**, so the branch ends up with the implementation
recorded rather than sitting as an unstaged dirty tree waiting for
someone else to notice.

Landed by `add-ithy-opsx-apply` (see
`openspec/changes/add-ithy-opsx-apply/proposal.md`).

## When Claude runs this

- User types `/ithy-opsx:apply <id>` in the embedded terminal or in a
  Claude Code session.
- The dashboard's agent runner injects `/ithy-opsx:apply <id>` as the
  `initialInput` for the bundled Claude agent (see `agents.yaml`).

## Steps

### 1. Preflight

1. **Change exists.** `openspec/changes/<id>/` must be present. If not,
   stop with a clear error.
2. **tasks.md exists.** Same directory must contain a `tasks.md`. If
   the change is missing tasks, this isn't ready for `apply` — stop and
   tell the user to run `/opsx:propose` first.
3. **Git identity is set.** Verify `git config user.name` and
   `user.email` resolve. If not, pause and point the user at the
   dashboard's Git panel (`add-git-identity`). Committing will fail
   without them; better to fail fast than deep inside the flow.

### 2. Delegate to `/opsx:apply <id>`

Run the upstream implementation skill:

```
/opsx:apply <id>
```

This is where the code changes happen: edits, task checkbox ticks,
whatever the change requires. Follow the standard `/opsx:apply` flow;
this skill adds nothing on top of what `/opsx:apply` normally does
during implementation.

### 3. Porcelain check

Once `/opsx:apply` reports it's done, check the tree:

```
git status --porcelain
```

- **Clean tree**: nothing to commit — skip to step 5 with a
  "nothing to commit" report. The agent decided the change was already
  implemented, or the tasks.md was already fully ticked, or no code
  changes were needed. That's fine.
- **Dirty tree**: continue to step 4.

### 4. Commit

Stage everything the apply step touched:

```
git add .
```

Draft a commit message with this shape:

```
agent: implement <change-id>

<summary — one to three bullets covering the top-level tasks.md
sections that got completed, or a sentence from proposal.md's Why
section as fallback>
```

Rules for the summary:

- Read `tasks.md` and note which top-level `## N. Section title`
  headers had all their items marked complete during this run.
- One bullet per completed top-level section, prefixed with `-`. If
  more than three sections completed, pick the three biggest / most
  meaningful and summarize the rest as one line.
- If nothing changed in tasks.md but files still changed, fall back
  to one sentence from `proposal.md`'s Why (first sentence, trimmed).

Present the drafted message to the user. Wait for approval or edits,
then run:

```
git commit -m "<the approved message>"
```

If pre-commit hooks fail, do NOT retry with `--no-verify`. Report the
hook's output verbatim and stop. The user fixes and re-runs
`/ithy-opsx:apply` (or runs `git commit` manually once fixed).

### 5. Report

Tell the user:

- The commit hash + subject line, if step 4 ran; or "clean tree,
  nothing to commit" if step 3 short-circuited.
- Any tasks.md sections that are still not fully ticked, so they
  know what's left before archiving.
- The next natural gesture: `/ithy-opsx:archive <id>` when ready to
  land + merge the change.

## What this skill does NOT do

- **Merge to main.** That's `/ithy-opsx:archive`'s job.
- **Push to remote.** User pushes when ready.
- **Split into multiple commits.** One implementation, one commit.
  Users who want granular commits should use `/opsx:apply` directly
  and commit as they go.
- **Auto-approve `--no-verify`.** Pre-commit hooks stay.

## Relationship to `/ithy-opsx:archive`

The archive skill has a safety-net step ("commit the agent's
uncommitted work") that runs when it detects an uncommitted worktree.
That step exists for:

- Users of non-Claude agents that don't commit.
- Interrupted apply runs (user cancelled mid-flow, hook rejected).
- Users who invoke `/opsx:apply` directly and forget to commit.

When the default flow uses `/ithy-opsx:apply`, that safety net is a
no-op — the commit already happened. Both skills together make the
"end state has a commit" invariant robust.

## See also

- `.claude/skills/ithy-opsx-archive/SKILL.md` — the archive-as-commit
  flow that follows apply.
- `.claude/commands/opsx/apply.md` — the upstream apply command this
  skill delegates to.
- `agents.yaml.example` — the bundled Claude entry uses
  `/ithy-opsx:apply` as its `initialInput`.
