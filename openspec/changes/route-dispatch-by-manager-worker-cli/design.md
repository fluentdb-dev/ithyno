## Context

There are currently two worker-launch implementations. The HTTP Agent runner
loads an Agent definition and calls `AgentRegistry.resolve()`, while the
Manager-executed dispatch skill reads `agents.yaml` and writes a shell command
directly. The latter hard-codes Claude as the Task-tool client and appends
`-p` to every subprocess, even though Codex uses an `exec` subcommand and `-p`
means profile selection there.

The semantic distinction is not "Claude versus everything else." It is whether
the Manager can delegate to a same-client child through a native Agent/Tool.
Cross-client execution necessarily leaves the Manager runtime and must use a
subprocess or agmsg peer.

The installed Agy 1.1.11 runtime exposes `invoke_subagent` to its Manager.
That tool is the verified Agy same-CLI native adapter. Agy workers selected by
a different Manager CLI remain cross-CLI and use AgentRunner.

## Goals / Non-Goals

**Goals:**

- Select native delegation from Manager/worker CLI equality and adapter
  capability.
- Centralize every subprocess prompt grammar in the server registry.
- Reuse dispatcher-created execution roots without allowing caller-selected
  paths.
- Preserve phase, artifact, timeout, retry, and agmsg completion contracts.
- Keep Claude-authored dispatch material canonical while emitting correct
  client-specific instructions.

**Non-Goals:**

- Defining a universal native sub-agent API shared by vendors.
- Installing Agent CLIs, authentication, OpenSpec, or ithyno skills.
- Changing worker selection, role matching, review verdicts, or phase order.
- Adding session resume support to Codex or another CLI.
- Replacing agmsg for persistent `live-shell` workers.

## Decisions

### D1 — Normalize identity before selecting the launch strategy

The dispatcher resolves the configured Manager and worker to canonical CLI
identities. Known aliases such as `agy` and `antigravity` compare as the same
client. Basenames may be normalized, but arbitrary executable names are not
guessed into a vendor identity.

Launch priority is:

1. `live-shell` worker plus configured and available agmsg → agmsg peer.
2. Same canonical CLI plus an available native-delegation adapter → the
   Manager's Agent/Tool.
3. Otherwise → the server Agent runner subprocess path.

Same-client equality alone does not invent a tool. If a rendered client has no
native adapter, it takes the registry-backed subprocess fallback.

### D2 — Native delegation is rendered per Manager client

The canonical dispatch source describes the semantic operation: start one
child for a role with the resolved prompt, target root, and artifact contract,
then await that child. Renderers supply the client-specific instructions. The
Claude rendering uses its native Task/Agent tool, and the Agy/Antigravity
rendering uses `invoke_subagent` on Agy 1.1.11. CLIs without a verified native
sub-agent adapter, including Codex, fall back to the registry-backed subprocess
branch even when the Manager and worker share the same canonical CLI identity.

Native children do not pass through `AgentRegistry.resolve()` because no Agent
CLI subprocess is started. They receive the already resolved role prompt, the
absolute target root, and the same artifact contract used by every other
branch. When Agy's tool does not expose a separate cwd field, the dispatcher
places the absolute target-root restriction directly in the child prompt.

Because Agy can begin acting on the workflow before it reaches the detailed
native-delegation section, its renderer also emits
`.agent/rules/ithy-opsx-dispatch.md`. The rule makes `invoke_subagent`
mandatory after a single-prompt Agy worker is selected and prohibits the
Manager from implementing that worker role itself. It preserves the
higher-priority live-shell/agmsg route and permits only the documented
AgentRunner fallback when the native tool is unavailable or explicitly fails.

### D3 — Cross-client subprocesses use the existing Agent runner

The dispatch skill no longer assembles `<command> <args> -p <prompt>` itself.
It requests a worker run by Agent name, change id, role, and an execution-root
policy. The server derives the only allowed target from its current project:

- worktree execution → `<project>/.worktrees/<change-id>` on
  `agent/<change-id>`;
- main-tree execution → the current project root.

The request never carries a raw path. Reuse is permitted only after the server
verifies the derived directory and expected Git association. Creation remains
idempotent and has one owner for each launch path.

The Manager receives a job id and observes the existing job lifecycle rather
than treating HTTP acceptance as stage completion.

### D4 — Registry owns non-interactive argv

For a resolved single prompt:

- `codex` → add `exec` when absent and append the prompt positionally;
- every other supported subprocess CLI → append `-p` and the prompt when no
  prompt is already present.

Hand-authored complete prompt args remain authoritative and are not duplicated.
The preliminary registry normalization already committed on this branch is
part of this change, but it is not considered a dispatch fix until the dispatch
subprocess branch actually routes through the runner.

### D5 — Claude remains the authored source of truth

Behavioral edits begin in the Claude dispatch definition. Universal source and
renderer logic translate only client syntax and native-tool instructions.
Generated Claude, Codex, Agy, and other outputs are checked by drift tests and
are not maintained as independent behavioral specifications.

## Risks / Trade-offs

- **Native tools expose different invocation APIs.** Keep each invocation in a
  small renderer/adapter contract and test the emitted instruction shape.
- **Agy's native tool surface is version-specific.** Treat `invoke_subagent`
  as available for the verified Agy 1.1.11 runtime and retain AgentRunner as
  the fallback when the Manager runtime does not expose it.
- **A workflow instruction alone may be applied too late by Agy.** Emit a
  concise project rule alongside the workflow so mandatory delegation is in
  the Manager's always-loaded instruction surface.
- **Agy project paths are singular.** Render workflows and rules under
  `.agent/`. Treat only `.agents/workflows/` as legacy ithyno output and move
  it toward `.agent/workflows/`; do not rewrite the unrelated global agmsg
  location at `~/.agents/skills/agmsg`.
- **Agy workflow discovery is flat.** Encode the namespace in filenames such
  as `ithy-opsx-dispatch.md`; nested `ithy-opsx/dispatch.md` output is migrated
  and Claude `/namespace:command` references are rendered as Agy
  `/namespace-command` references.
- **Worktree reuse could attach to stale work.** Derive the path server-side and
  validate its branch/repository identity; reject ambiguity rather than remove
  or overwrite it.
- **Two completion mechanisms remain.** Native tools return to the Manager,
  subprocesses publish job state, and agmsg reports by message; all three still
  converge on the same artifact-based stage judgment.
- **Existing installed dispatch skills are stale after release.** Surface an
  ithyno skill update and document that only ithyno dispatch material needs
  regeneration.

## Migration Plan

No `agents.yaml` migration is required. After deployment, restart the server or
packaged application so the updated registry/runner is active, then regenerate
project-local ithyno skills through Settings for projects that dispatch from
installed skill copies.

## Open Questions

None.
