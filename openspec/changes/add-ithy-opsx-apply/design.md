## Context

Two things converge on this change:

1. `add-ithy-opsx-archive` shipped with a step 2 safety net —
   "commit any uncommitted work on the agent branch before merging."
   That step exists because agents don't commit by default. It works,
   but it puts the "when was this actually implemented" moment on the
   archive skill's shoulders, which is a slightly odd home for it.
2. The `/ithy-opsx:` namespace has one command so far. Every `ithy-opsx:`
   command follows the same shape: it wraps its `opsx:` counterpart with
   the ithyno app's concerns bolted on. Archive got git-commit added.
   Apply naturally gets git-commit added too, at the other end of the
   life cycle.

This change is the smaller half of a pair: **apply commits the
implementation**; **archive commits the archival move**. Together the
history reads:

```
* archive: add-foo
* agent: implement add-foo
```

Two lines, two concerns. No mystery "why is this in main."

## Goals / Non-Goals

**Goals:**
- The Claude default agent, when run in a worktree, ends by committing
  its implementation on the agent branch.
- Skill-driven — text file, editable by users who want a different
  commit message shape.
- Reuse `/opsx:apply` for the actual implementation flow.
- Keep the archive safety net; this is defense in depth.

**Non-Goals:**
- Modifying upstream `/opsx:apply`.
- Enforcing commit at the runner (server code) level.
- Custom per-project commit-message templates.
- Non-Claude agents. Aider, Codex, etc. each have their own commit
  conventions; users configure those explicitly in `agents.yaml`.

## Decisions

### Skill wraps `/opsx:apply` rather than reimplementing

The apply flow (planning, editing, ticking tasks) lives in
`/opsx:apply`. This skill delegates to it. Only the post-step commit
is our addition. Reasons:

- Upstream may improve the apply flow; we inherit it for free.
- Wrapping keeps our surface small — one commit step to maintain.
- The user's Claude can still invoke `/opsx:apply` directly for a
  bare non-committing flow when they want that.

### `git status --porcelain` before committing

Read git state before running `git add`. If clean (nothing to commit),
skip the commit step and just report. Prevents empty commits when the
agent decided the change was already implemented / the tasks.md was
already fully ticked.

### Commit message shape: `agent: implement <id>`

Prefix `agent:` to make these easy to filter in `git log --grep`.
Rationale for one commit-per-agent-run:

- Simpler for archive to reason about.
- Reflects the atomic "run agent → get an implementation" gesture.
- If the user wants per-task commits, they can drop `/ithy-opsx:apply`
  and use `/opsx:apply` directly with their own commit strategy.

Message body:
- One-line summary from the top-level tasks.md sections that got
  completed, or a sentence from `proposal.md`'s Why section as fallback.
- Kept short (< 5 lines). The archive commit's summary carries the
  broader "why."

### Skip if `--no-verify` is needed

If a pre-commit hook fails, do NOT retry with `--no-verify`. Report
the hook's output, leave the tree dirty, tell the user. Same rule as
the archive skill. Consistency matters more than progress.

### Default in `agents.yaml`

The bundled Claude entry:

```yaml
- name: claude
  command: claude
  args: []
  initialInput: "/ithy-opsx:apply ${change_id}"
```

Was `initialInput: "/opsx:apply ${change_id}"`. One-character swap in
practice; the semantics are "commit before you finish."

### Archive skill's safety net stays

`.claude/skills/ithy-opsx-archive/SKILL.md` step 2 (commit uncommitted
agent work) is unchanged. Reasons:

- Users may register a different agent that doesn't run our skill.
- Apply skill could be interrupted (user cancelled mid-run) leaving
  a partially-committed or dirty tree.
- Belt-and-suspenders is cheap here: step 2 is a no-op when apply
  already committed.

## Alternatives considered

- **Modify `/opsx:apply` upstream to include commit**. Not our call;
  and it would tie every OpenSpec CLI user to this convention.
- **Runner-side hook**: after `spawn` finishes, server runs
  `git commit`. Complicates the runner (message generation from
  server-side?), and the runner is currently generic. Skill is the
  right home.
- **Ask the user for a commit message each time**. Extra friction
  compared to auto-drafting; users who want to edit can — the apply
  skill's commit step still asks for approval before running.
- **Squash all commits at archive time**. Loses the two-line history
  advantage; makes it harder to see when the implementation landed.

## Risks

- **Draft message doesn't fit the change.** Mitigated by user
  approval before commit runs.
- **Empty commit on a clean tree**. Prevented by the porcelain check.
- **Pre-commit hook rejects.** Documented in the skill; user fixes
  and re-runs.
- **Users still using `/opsx:apply` directly.** Fine — the archive
  skill's safety-net commit step catches them.
