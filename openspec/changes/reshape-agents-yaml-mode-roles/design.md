# Design — reshape-agents-yaml-mode-roles

## Target schema

```yaml
runtimes:                                    # optional; shared defaults
  claude:
    command: claude
    args: [--dangerously-skip-permissions]   # -p is NOT here; runner injects it
    promptFlag: -p                           # single-prompt: unshifted before prompt
    promptStyle: cli-arg                     # cli-arg | stdin | file (file: reserved)
    prompts:                                 # role → default prompt template
      code: "/opsx:apply ${change_id}"
      review: "/opsx:review ${change_id}"
      verify: "/opsx:verify ${change_id}"
      manager: "/opsx:manage"

agents:
  # Multi-role worker
  - name: claude-worker
    runtime: claude                          # inherits command/args/promptFlag/prompts
    mode: single-prompt                      # single-prompt | live-shell
    roles: [code, review, verify]
    specialties: []
    concurrency: 1
    dedicated: false

  # Manager (PTY, interactive, singleton)
  - name: claude-manager
    runtime: claude
    args: [--continue]                       # overrides runtime's args
    mode: live-shell
    roles: [manager]
    prompts:                                 # overrides runtime.prompts.manager
      manager: "/opsx:manage --resume"

  # No-runtime agent — self-contained
  - name: aider-worker
    command: aider
    args: [--yes-always]
    mode: single-prompt
    roles: [code]
    prompts:
      code: "Implement ${change_id}"
```

## The mode axis

**`single-prompt`**
- Runner spawns the child, unshifts `promptFlag + resolved-prompt` (when `promptStyle: cli-arg`), captures stdout to buffer, waits for exit.
- Job terminal status derives from exit code.
- Used for headless work: code / review / verify.

**`live-shell`**
- Runner spawns a PTY, writes `resolved-prompt + \n` to stdin after boot.
- Job stays `running` until the user detaches or the process exits.
- Used for Manager (interactive orchestration).

This axis is orthogonal to `runtime` — a `live-shell` agent can either reference a runtime for defaults or specify `command` directly. The runner branches on `mode`, not on which shape the agent used to declare itself.

## The roles axis

An agent's `roles: string[]` is what the dispatch selector matches against. Semantics:

- Dispatch request carries a **scalar** `role`.
- Selector filters agents where `agent.roles.includes(request.role)`.
- Everything downstream (specialty score, runtime filter, declaration-order tiebreak) is unchanged.

Job records carry a **scalar** `role` — the one that was dispatched — so a single `claude-worker` agent shows up as separate jobs labeled `role: code` / `role: review` / `role: verify` in `/api/agents/jobs`. Traceability is per-dispatch, not per-agent.

**Manager singleton** stays: at most one agent may have `manager` in its `roles`. Enforced at load time.

## Prompt resolution

At dispatch time, for a chosen agent and requested role:

1. If `agent.prompts?.[role]` exists, use it.
2. Else if `agent.runtime` is set and `runtimes[agent.runtime].prompts?.[role]` exists, use that.
3. Else fall back to built-in default:
   - `code` → `/opsx:apply ${change_id}`
   - `review` → `/opsx:review ${change_id}`
   - `verify` → `/opsx:verify ${change_id}`
   - `manager` → `/opsx:manage`
   - `other` → error (no default; must be specified)

Template substitution runs on the resolved string (`${change_id}`, `${worktree_path}`, `${branch}`), same as today.

## Backward compatibility — normalization at load

The loader normalizes old shapes into the new schema, then validates. Users don't have to migrate their `agents.yaml`.

Normalization rules:

| Old field / shape | New shape after normalization |
|---|---|
| `role: "code"` | `roles: ["code"]` |
| `command + args + initialInput` on a non-manager agent | `mode: single-prompt`, `prompts.<sole-role>: initialInput` |
| `command + args + initialInput` on a `role: manager` agent | `mode: live-shell`, `prompts.manager: initialInput` |
| `runtime + prompt` | `mode: single-prompt` if `runtimes[runtime].promptStyle === "cli-arg" \|\| "stdin"`, `prompts.<sole-role>: prompt` |
| `runtime + prompt` on `role: manager` | `mode: live-shell`, `prompts.manager: prompt` |
| Bare `command` with no `initialInput` and no `role: manager` | `mode: single-prompt`, `prompts.<sole-role>: (built-in default)` |

Each normalization that fires SHALL emit a warning to the load log naming the entry and pointing at this change's outcome doc as the migration guide.

## Modal shape (informational)

New Modal form state (before submit):

```ts
type Form = {
  name: string;
  runtime?: string;                    // dropdown: "none" | keys(runtimes)
  command: string;                     // optional if runtime is set (inherits)
  args: string;                        // optional if runtime is set (inherits)
  mode: "single-prompt" | "live-shell";
  roles: string[];                     // multi-select
  prompts: Record<string, string>;     // one textarea per role in roles[]
  specialties: string;                 // comma-separated
  concurrency: number;
  dedicated: boolean;
  description?: string;
};
```

Modal removes: `shape` toggle, `initialInput` field, `prompt` field (folded into `prompts.<role>`).

Modal adds: mode toggle, roles multi-select, per-role prompt textareas.

Inherited-default hints: when `runtime` is set, inputs for `command`, `args`, and `prompts.<role>` show muted placeholder text like "Inherits from runtime: `<value>`" when the local override is empty.

## Manager constraint

Enforced client-side (Modal) and server-side (loader):

- At most one agent may have `manager` in `roles`.
- An agent with `manager` in `roles` MUST have `mode: live-shell`.
- An agent with `mode: live-shell` MAY have other roles alongside `manager` (kept lenient — user can experiment with "interactive worker" configurations if they want).

Modal-side: the `roles` multi-select filters out `manager` when another agent already declares it, unless the current agent being edited is that manager (unchanged from today's Manager-role filter logic).

## Runner impact

`server/agents/runner.ts` branches on `mode`, not on `shape`:

```ts
if (agent.mode === "single-prompt") {
  spawnHeadless(agent, resolvedPrompt);
} else {
  spawnPty(agent, resolvedPrompt);
}
```

The `promptStyle` field on the runtime still controls how the prompt is delivered under `single-prompt`:

- `cli-arg` — unshift `promptFlag + prompt` before spawn args
- `stdin` — write prompt to child.stdin after spawn
- `file` — still reserved

Under `live-shell`, `promptStyle` is ignored — the prompt is always typed into the PTY after boot.

## What this doesn't fix

- **Per-agent env / cwd overrides** — out of scope, same as today's config.
- **Nested runtime references** (a runtime that inherits from another runtime) — out of scope.
- **Fanout dispatch** (one request → multiple agents / roles) — out of scope; the selector still picks one.

## Risks and mitigations

1. **Loader normalization complexity.** Every old shape has to survive. Mitigation: exhaustive load-time tests (see tasks.md §7) covering each of the normalization rules above.
2. **Modal state migration.** Existing agents load into the Modal with normalized state; user opens the Modal, sees the new fields populated, saves — and the file is now in the new shape. Users who never touch the Modal keep the old shape. Not a bug, but a subtle rewrite path that we should call out in the outcome doc.
3. **`add-modal-command-picker-and-presets` depends on this.** Two orders work:
   - **Order A (recommended)**: land this change first; then reshape the preset change to target the new schema.
   - **Order B**: land the preset change against Legacy shape now; then this change reshapes both the schema and the preset table.

   Order A is cleaner because it avoids one round of preset-table rewrite. Land this proposal, then rebase the preset proposal on top.
