## Context

AgentRunner launches subprocess workers with `cwd` already set to the resolved
worktree or main tree. Native launches receive the same execution root and an
artifact contract naming an absolute `review.md` path. However, the review
workflow still assumes it starts in the repository root and runs
`cd .worktrees/<change-id>`. Repository-level `AGENTS.md` also tells workers to
write the artifact outside the worktree, while AgentRunner parses it from the
resolved execution root.

Codex installation currently converts Claude review and verify commands into
`.codex/prompts/` files but intentionally does not add matching
`.codex/skills/` entries. A non-interactive Codex worker receives the bare name
`ithy-opsx-review`, so it can interpret the text freely instead of resolving a
catalog Skill.

## Goals / Non-Goals

**Goals:**

- Give every stage one authoritative execution root and artifact path.
- Ensure a successful stage artifact was produced by the current worker run.
- Make Codex review and verify worker names discoverable as exact Skills.
- Preserve Claude commands and Agy workflows as the behavioral baseline.

**Non-Goals:**

- Changing the review rubric or frontmatter schema.
- Moving review artifacts into the main tree during worktree execution.
- Adding a native Codex child-agent adapter.
- Changing code-worker commit ownership or phase transitions.

## Decisions

### D1 — The resolved execution root owns the artifact

In worktree mode, `review.md` belongs under the resolved worktree. In main-tree
mode, it belongs under the project root. The dispatcher passes the exact
absolute path; this contract overrides relative examples in the workflow.

The review workflow detects whether its current directory is already the
target tree. It only selects `.worktrees/<change-id>` for a direct interactive
invocation that starts from a repository root containing that worktree.

### D2 — AgentRunner invalidates stale review output before launch

Before spawning a `review` or `verify` role, AgentRunner removes the previous
`review.md` from the resolved execution root. Missing files are a no-op; other
filesystem errors reject the run before the worker starts. This makes the
post-exit parser evidence of the current run rather than an earlier stage.

Native and agmsg branches retain the same rule in the dispatch workflow because
they do not pass through AgentRunner.

### D3 — Codex worker Skills are thin entrypoints

Codex installation continues to generate the full procedure under
`.codex/prompts/ithy-opsx-{review,verify}.md`. It additionally generates thin
`.codex/skills/ithy-opsx-{review,verify}/SKILL.md` entrypoints that require the
agent to read and execute the corresponding Prompt. This avoids duplicating the
procedure while making the exact names sent by the dispatcher discoverable.

### D4 — Explicit artifact contracts outrank repository defaults

`AGENTS.md` and Copilot instructions describe the same rule: when dispatch
provides an absolute artifact path, use it exactly. Without a dispatch contract,
write relative to the current execution tree. They no longer prohibit worktree
artifacts.

## Risks / Trade-offs

- Removing an old artifact loses the previous stage's file in the worktree.
  The dispatcher already parses review findings before retrying and passes them
  to the next code worker, so retaining the file is not a valid completion
  signal and is less important than freshness.
- A thin Codex Skill still depends on its Prompt being installed. The Skill
  therefore names the exact file and fails clearly when it is missing.
- Direct interactive review from an unusual nested directory remains
  unsupported; the workflow reports the resolved root rather than guessing
  across repositories.

## Migration Plan

Re-run Manage Skills or project initialization for Codex projects to create the
new review and verify Skill entrypoints. Existing Prompt files remain valid and
are not renamed.
