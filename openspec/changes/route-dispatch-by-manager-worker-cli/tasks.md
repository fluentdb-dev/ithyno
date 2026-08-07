## 1. Routing Contract and Proposal Refinement

- [x] 1.1 Add canonical Manager/worker CLI identity normalization, including
  the `agy` / `antigravity` alias, and a pure strategy selector for
  `agmsg | native | subprocess`.
- [x] 1.2 Verify Agy's available native child-agent surface in the target
  version; if its adapter details change any documented behavior, update this
  proposal, design, and spec delta and rerun strict validation before coding
  continues.
  _Resolved: `agy 1.1.10` provides no native child-agent/Tool API. Task 3.4
  documents the explicit subprocess fallback; no adapter is implemented._
- [x] 1.3 Add a routing matrix covering same-CLI, cross-CLI, unavailable native
  adapters, and the higher-priority live-shell/agmsg branch.
- [x] 1.3.1 Add a test case for the `agy`/`antigravity` same-CLI scenario:
  verify that when both Manager and worker are `agy` (or `antigravity`), the
  strategy resolves to `subprocess` — NOT native delegation — because `agy
  1.1.10` provides no native child-agent API.

## 2. Registry-Backed Subprocess Execution

- [x] 2.1 Normalize single-prompt argv so Codex uses `exec <prompt>` and
  non-Codex subprocess CLIs use `-p <prompt>` without duplicate injection.
- [x] 2.2 Extend the Agent runner/API with a server-derived execution-root
  policy that can safely reuse the expected worktree or current project root
  without accepting a raw caller path.
- [x] 2.3 Make the dispatcher use the Agent runner for cross-CLI and native-
  unavailable subprocess launches, then await the returned job's terminal
  state and preserve its diagnostics.
- [x] 2.4 Test worktree reuse, main-tree execution, stale/wrong worktree
  rejection, duplicate jobs, process failure, and timeout behavior.

## 3. Native Same-CLI Delegation

- [x] 3.1 Replace the Claude-command condition with Manager/worker canonical
  CLI equality plus native-adapter availability.
- [x] 3.2 Render the Claude same-client path through its native Task/Agent tool
  with the resolved role prompt and artifact contract.
- [x] 3.3 Document fallback from Codex same-client path to subprocess because Codex
  has no native sub-agent tool API in its current stable CLI surface.
- [x] 3.4 Implement or explicitly fall back from the Agy native adapter based
  on task 1.2, without changing the cross-CLI subprocess contract.

## 4. Canonical Skill Distribution

- [x] 4.1 Update the Claude-authored dispatch source as the behavioral source
  of truth and remove the generic direct `<command> ... -p` subprocess recipe.
- [x] 4.2 Regenerate universal/per-CLI dispatch outputs through renderers rather
  than editing generated copies independently.
- [ ] 4.3 Add drift and rendered-content tests proving Claude, Codex, Agy, and
  fallback clients receive the correct strategy and command syntax.
- [x] 4.4 Update the multi-agent CLI manual to describe automatic Codex `exec`
  and non-Codex `-p` prompt delivery.

## 5. Verification

- [ ] 5.1 Run focused registry, runner, API, renderer, and dispatch tests.
- [ ] 5.2 Run `npm run typecheck && npm test && npm run build`.
- [ ] 5.3 Run `npm run openspec -- validate route-dispatch-by-manager-worker-cli --strict`
  and `npm run openspec -- validate --all`.
- [ ] 5.4 Exercise at least one same-CLI native dispatch and one cross-CLI
  registry-backed dispatch in a temporary project, then record results in
  `outcome.md`.
