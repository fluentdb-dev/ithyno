## 1. Routing Contract and Proposal Refinement

- [x] 1.1 Add canonical Manager/worker CLI identity normalization, including
  the `agy` / `antigravity` alias, and a pure strategy selector for
  `agmsg | native | subprocess`.
- [x] 1.2 Verify Agy's available native child-agent surface in the target
  version; if its adapter details change any documented behavior, update this
  proposal, design, and spec delta and rerun strict validation before coding
  continues.
  _Resolved: the installed `agy 1.1.11` runtime exposes
  `invoke_subagent`; it is the same-CLI native adapter. Cross-CLI Agy workers
  continue through AgentRunner._
- [x] 1.3 Add a routing matrix covering same-CLI, cross-CLI, unavailable native
  adapters, and the higher-priority live-shell/agmsg branch.
- [x] 1.3.1 Add test cases for the `agy`/`antigravity` same-CLI scenarios:
  verify that aliases normalize to Agy and select native delegation through
  `invoke_subagent`, while cross-CLI Agy workers select AgentRunner.

## 2. Registry-Backed Subprocess Execution

- [x] 2.1 Normalize single-prompt argv so Codex uses `exec <prompt>` and
  non-Codex subprocess CLIs use `-p <prompt>` without duplicate injection.
- [x] 2.2 Extend the Agent runner/API with a server-derived execution-root
  policy that can safely reuse the expected worktree or current project root
  without accepting a raw caller path.
- [x] 2.3 Route cross-CLI and native-unavailable workers through the shared
  subprocess launcher. After the worker returns, judge semantic success from the
  established artifact files and preserve launcher diagnostics only for execution failures.
- [x] 2.4 Test worktree reuse, main-tree execution, stale/wrong worktree
  rejection, duplicate jobs, process failure, and timeout behavior.

## 3. Native Same-CLI Delegation

- [x] 3.1 Replace the Claude-command condition with Manager/worker canonical
  CLI equality plus native-adapter availability.
- [x] 3.2 Render the Claude same-client path through its native Task/Agent tool
  with the resolved role prompt and artifact contract.
- [x] 3.3 Document fallback from Codex same-client path to subprocess because Codex
  has no native sub-agent tool API in its current stable CLI surface.
- [x] 3.4 Implement the Agy 1.1.11 `invoke_subagent` native adapter without
  changing the cross-CLI AgentRunner contract.
- [x] 3.5 Emit an Agy project rule that requires `invoke_subagent` for a
  selected same-CLI worker, forbids Manager-side implementation, preserves
  agmsg priority, and permits only the documented AgentRunner fallback.
- [x] 3.6 Normalize every Agy project-local workflow, rule, probe, and
  installation-check path to singular `.agent/`, reversing the legacy
  `.agents/workflows/` migration while leaving global agmsg paths unchanged.
- [x] 3.7 Flatten Agy ithyno workflows to `ithy-opsx-<command>.md`, translate
  command references to Agy's hyphen syntax, and migrate both singular and
  plural nested workflow output.
- [x] 3.8 Strip Claude-only `name`, category, tag, and argument metadata when
  converting unported Claude commands so Agy recognizes every copied workflow
  from its flat filename.

## 4. Canonical Skill Distribution

- [x] 4.1 Update the Claude-authored dispatch source as the behavioral source
  of truth and remove the generic direct `<command> ... -p` subprocess recipe.
- [x] 4.2 Regenerate universal/per-CLI dispatch outputs through renderers rather
  than editing generated copies independently.
- [x] 4.3 Add drift and rendered-content tests proving Claude, Codex, Agy, and
  fallback clients receive the correct strategy and command syntax.
- [x] 4.4 Update the multi-agent CLI manual to describe automatic Codex `exec`
  and non-Codex `-p` prompt delivery.
- [x] 4.5 Generate `.codex/skills/ithy-opsx-dispatch/SKILL.md` as a thin
  single-change entrypoint backed by the canonical Codex Prompt, with an
  explicit guard against substituting `dispatch-multi` for one change ID.
- [x] 4.6 Resolve Codex code workers to the installed
  `openspec-apply-change` Skill and append an implementation-only scope
  contract that forbids archive, spec sync, and commit.
- [x] 4.7 Define dispatch-multi concurrency as sequential stages per change and
  phase-independent concurrency across changes, with non-blocking AgentRunner
  fan-out and change-owned job polling.

## 5. Verification

- [x] 5.1 Run focused registry, runner, API, renderer, and dispatch tests.
- [x] 5.2 Run `npm run typecheck && npm test && npm run build`.
- [x] 5.3 Run `npm run openspec -- validate route-dispatch-by-manager-worker-cli --strict`
  and `npm run openspec -- validate --all`.
- [x] 5.4 Exercise at least one Agy same-CLI `invoke_subagent` dispatch and one
  cross-CLI registry-backed dispatch in a temporary project, then record the
  actual results in `outcome.md`.
- [x] 5.5 Verify the corrected Codex Skill name and scope contract through
  registry, renderer, template-drift, typecheck, build, and strict validation.
