## Why

Review workers can complete without producing the `review.md` artifact that the
dispatcher expects. The current instructions disagree about whether the file
belongs in the main tree or the worktree, the review command may `cd` into a
nested non-existent worktree even though AgentRunner already selected the
execution root, and Codex receives a review command name without a discoverable
Codex Skill entrypoint.

## What Changes

- Make the dispatcher-selected execution root and absolute artifact path the
  authoritative review contract for every worker launch strategy.
- Make the review and verify workflows safe when they start in either the
  repository root or an already-selected worktree, without blindly entering
  `.worktrees/<id>`.
- Align repository worker instructions with the dispatcher's worktree artifact
  contract.
- Materialize discoverable Codex Skill entrypoints for internally invoked
  review and verify workflows while retaining their generated Codex Prompts as
  the canonical procedure bodies.
- Remove a prior review artifact before a new review or verify worker starts so
  stale output cannot satisfy the current stage.
- Add regression coverage for paths, Codex output, and artifact freshness.

## Capabilities

### Modified Capabilities

- `agent-runner`: review and verify stages use a fresh artifact at the exact
  execution-root-relative absolute path.
- `cross-cli-skill-installer`: Codex receives discoverable worker Skill
  entrypoints for review and verify.

## Impact

- Review and dispatch workflow definitions and their initialization templates.
- Non-Claude worker instructions for this repository.
- Codex command-to-Prompt migration.
- AgentRunner artifact lifecycle.
- Renderer, initialization, and runner regression tests.
