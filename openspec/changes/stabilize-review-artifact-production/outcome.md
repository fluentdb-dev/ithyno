## Worked

- Making the dispatcher-provided absolute artifact path authoritative removes
  the main-tree/worktree ambiguity without changing the review schema.
- Thin Codex Skills preserve the existing generated Prompts as the procedure
  source while making the exact worker names discoverable.
- AgentRunner-side stale-artifact invalidation provides an enforceable guard in
  addition to the workflow instructions used by native and agmsg branches.
- Focused tests, all 56 project test files, typecheck, build, and strict OpenSpec
  validation passed.

## Surprises

- Repository `AGENTS.md` explicitly required the opposite artifact location
  from AgentRunner and the dispatch workflow.
- The review workflow still assumed a repository-root cwd even though
  AgentRunner had already standardized subprocess cwd on the execution root.
- Existing tests intentionally asserted that Codex review and verify Skills did
  not exist, exposing the same free-form command-resolution risk previously
  fixed for single-change dispatch.

## Differently

- Treat worker command discoverability and artifact production as one contract
  in future cross-CLI changes instead of testing only that Prompt files land.
- Add execution-root assertions whenever a workflow contains a literal `cd`.

## Follow-ups

- Reinstall ithyno skills in existing Codex projects so the new review and
  verify Skill entrypoints are materialized.
- Consider porting review and verify fully into `ithyno/skills/` once the
  remaining Claude-authored command migration is scheduled.
