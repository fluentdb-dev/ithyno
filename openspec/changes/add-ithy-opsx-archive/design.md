## Context

The Archive step in the OpenSpec workflow is the semantic commit — it's
the moment a change is accepted and folded into the specs. Today the
dashboard's `/opsx:archive <id>` moves the files but leaves the git
tree dirty. When a worktree agent implemented the change, the branch
also needs a merge. The user does these three things by hand every
time.

The pragmatic response would be a server-side endpoint that runs the
whole chain atomically. But that path re-implements `openspec archive`
in TypeScript, buries the steps in HTTP handlers, and makes it hard
for the user to adjust the flow ("I want to skip the outcome check for
docs-only changes"). The alternative, which fits the project's style,
is to **write the flow as a skill** and expose it as one slash command:
the LLM is the runner, the skill is the recipe, the dashboard is the
trigger.

This is the same pattern outlined in
`docs/ideas/2026-07-01-merge-workflow-and-namespace.md` for
`/ithy-opsx:merge`. Archive is the natural first command in that
namespace because we already inject `/opsx:archive` today — the switch
is one string.

## Goals / Non-Goals

**Goals:**
- One command, `/ithy-opsx:archive <id>`, runs the full sequence:
  optional worktree merge → openspec archive → git commit with a
  reviewable auto-generated message.
- Skill body lives in Markdown, editable by the user.
- Dashboard rewire is trivial (one string swap).
- Idea file promotion: the `/ithy-opsx:` namespace is now real and
  discoverable via the archive command.

**Non-Goals:**
- Server-side archive/commit HTTP endpoint.
- Push to remote.
- Merge-conflict resolution UI.
- Deprecating `/opsx:archive`.
- The other `/ithy-opsx:` commands (merge, reject, review) — separate
  proposals.

## Decisions

### Namespace: `/ithy-opsx:` (not `/opsx:`)

The idea file settled this: `ithy-opsx:` marks ithyno-provided
extensions of the upstream `opsx:` family. Two visible spaces —
`ithy-opsx:` and `opsx:` — surface which commands are the OpenSpec CLI's
vs. this project's overlays. Users typing `/opsx` tab-complete only the
upstream set; `/ithy` gets the app's family.

### Delegate archive to `openspec archive`

The skill runs `openspec archive <id>` (or the Claude-Code-equivalent
`/opsx:archive <id>` inside its own execution). We do not re-implement
the file moves. If upstream OpenSpec changes the archive layout
tomorrow, we inherit it for free.

### Commit message format

Auto-generated, editable:

```
archive: <change-id>

<one-line why summary — first sentence of proposal.md's Why section>

Tags: <tags-from-frontmatter>
```

Rationale:
- **Subject line** `archive: <id>` — grep-friendly, conventional
  commits shape.
- **Body** takes one line from the Why. Skill instructs Claude to trim
  to a sentence, not paste the whole section.
- **Trailer** carries tags so `git log --grep` on a tag surfaces the
  relevant archive commits.

Claude presents the drafted message; the user approves or edits.

### Worktree merge in the same command

The skill runs `git merge --no-ff agent/<id>` before archiving if the
worktree exists. Reasons:

- Archive without merge would create archive commits that don't
  contain the actual code changes — the code lives on the agent branch.
- The user's goal is "close out this change." Merge is part of that.
- `--no-ff` preserves the "agent worked on this branch" fact in the
  history without requiring the user to think about ff-vs-merge.

If the merge conflicts, the skill pauses. It does not proceed to
archive — that would leave a half-done state that's harder to reason
about than "merge conflict, resolve and retry."

### Cleanup ask (worktree removal)

After a successful merge + archive + commit, the agent branch and
worktree are dead weight. The skill **asks** the user before running
`git worktree remove` + `git branch -D`. Default suggestion: yes.
Rationale: destructive git ops always ask, per the project's git
safety norm.

### Interaction with `commandStyle`

The dashboard's `commandStyle` toggle currently switches between
`/opsx:archive <id>` (Claude) and `npx openspec archive <id>` (CLI).
This change adds a third possibility for Claude style:
`/ithy-opsx:archive <id>`. The CLI branch is unchanged.

Simple approach: Claude-mode archive always uses `/ithy-opsx:archive`.
Users who want the plain `/opsx:archive` behavior can switch to CLI
mode. This trades one degree of user choice for a cleaner mental model
("Claude flow = ithy-opsx archive with commit; CLI flow = plain archive").

### Skill body in Markdown, not TypeScript

The skill body is prose Claude executes. Editable, transparent,
versioned. If a project team wants to change the outcome-check
severity, they edit Markdown, not code. Skills compose with other
skills — the archive skill can eventually invoke a shared
`ithy-opsx-preflight` skill without a build step.

## Alternatives considered

- **Server-side archive endpoint.** Rejected. See Context.
- **Extend `/opsx:archive` upstream.** Not our decision; the OpenSpec
  CLI is not the right home for git-commit orchestration.
- **Terminal-injected one-liner** (`openspec archive && git commit ...`).
  Rejected: no preflight, no message editing, no conflict pause,
  brittle to edit.
- **Two commands: `/ithy-opsx:merge` and `/ithy-opsx:commit-archive`**.
  Rejected for v1: the user's ask is "one gesture." We can split later
  if the sequence proves too coupled.

## Risks

- **Skill drift.** A project team edits the skill and forgets. Mitigate
  with clear comments in the skill and a link back to the proposal.
- **User confusion between `/opsx:archive` and `/ithy-opsx:archive`.**
  Mitigate with docs (parallel-shells.md), the CLI vs Claude toggle
  wording, and the idea file's promotion to explain the split.
- **Merge conflicts blocking the archive.** Documented in the skill's
  pause step; user must resolve manually. Not worse than today.
- **Auto-generated commit message quality.** Draft-then-approve pattern
  means the user always sees the message. Bad draft → user edits, ships.
