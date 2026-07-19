---
tags: [feature/agent-runner, area/server]
---

## Why

Worktree agents that expect a **prompt on stdin** (e.g. Claude Code CLI
without `-p`, Aider, Codex) don't get one today. `add-agent-runner`
passes the change id through `args`, but that becomes `argv[]` — a CLI
argument, not a REPL prompt. Modern coding CLIs are REPLs first: they
read the initial task from stdin, not from `argv`.

The immediate consequence:

```yaml
args: ["/opsx:apply", "${change_id}"]
```

is silently a no-op with Claude Code — the CLI ignores those positional
args (they're neither a subcommand nor a valid flag) and then waits on
stdin. `add-agent-stdin-relay` opened the pipe, but nothing writes to
it at startup. Result: the agent hangs, times out its stdin wait,
prints `no stdin data received in 3s, proceeding without it`, and idles
forever with no prompt to work on.

**Print mode (`-p`) works around this for Claude specifically**, but:

- It's a Claude-CLI-only flag; not portable across agents.
- The Claude team has already refactored their entry twice; treating
  `-p` as the load-bearing shape is fragile.
- Print mode disables the interactive stdin relay we just landed —
  the two features become mutually exclusive per-agent.

The **portable** answer is Unix-standard: **write the initial prompt to
the child's stdin** immediately after spawn. Every REPL that reads
stdin accepts this. It composes with `add-agent-stdin-relay`
(same pipe, subsequent writes are user responses to prompts).

## What Changes

- **`agents.yaml`** grows a new optional field **`initialInput`** — a
  string, with the same template-variable substitution (`${change_id}`,
  `${worktree_path}`, `${branch}`) that `args` and `env` already
  support.
- **Server**: after `spawn`, the agent runner writes
  `<resolved initialInput>` **plus a trailing newline** to the child's
  stdin, once, and only when the field is defined. The write is echoed
  into the job's output ring buffer as a `stream: "stdin"` line (same
  path as `add-agent-stdin-relay`) so the transcript captures it.
- **Ordering**: the write happens right after `spawn` returns and the
  `stdin` pipe is confirmed writable. It does not wait for any output
  from the child — CLIs that need a moment to boot buffer the input
  naturally.
- **Absence of `initialInput`** keeps the pre-change behavior verbatim.
  Agents that took their prompt via `args` (or don't need a prompt at
  all) are unaffected.

Recommended migration for the bundled Claude agent (documented in
`agents.yaml.example`):

```yaml
- name: claude
  command: claude
  args: []
  initialInput: "/opsx:apply ${change_id}"
```

Same slash command, delivered via stdin instead of argv. The stdin
relay from `add-agent-stdin-relay` remains fully functional for
answering subsequent permission prompts.

## Capabilities

### New Capabilities
<!-- none — extends an existing capability -->

### Modified Capabilities
- `agent-runner`: `agents.yaml` entries may declare an `initialInput`
  string that is written to the child's stdin at spawn time, composing
  with the existing stdin relay for follow-up interaction

## Impact

- **`server/agents/registry.ts`**: `AgentDef` grows an optional
  `initialInput?: string`; parsed from YAML; passed through
  `resolve()` alongside `args` and `env` so template variables get
  substituted the same way.
- **`server/agents/runner.ts`**: after `child = spawn(...)`, if the
  resolved def has `initialInput`, write it to `child.stdin` using the
  same helper `writeInput` already uses (append newline; push a
  `stream: "stdin"` echo into the ring buffer; broadcast).
- **`server/model.ts`**: `AgentPublic` gets `initialInput?: string`
  (opt-in) so the UI can preview it in the agent picker if desired.
- **`web/src/types.ts`**: mirror the field.
- **`web/src/components/ExecutionPicker.tsx`**: no change required.
  (Optionally the Worktree option's `code` preview could show
  `<agent> <args>` with `initialInput` on the next line, but that's a
  polish item for a follow-up.)
- **`agents.yaml.example`**: replace the current `args`-based Claude
  entry with the `initialInput`-based one; keep an inline note about
  the older `args` shape as an alternative for CLIs that do accept a
  prompt via argv.
- **Tests**: unit test on registry parse + template substitution; unit
  test on runner (mock child) verifying the initial write happens
  exactly once with the substituted value plus newline.
- **Docs**: `docs/architecture/parallel-shells.md` — one paragraph
  clarifying why we prefer stdin over CLI flags for the initial prompt.

## Out of scope

- **Structured multi-step initial input** (e.g. an array of lines with
  delays between them). If needed later, add it as `initialInput: []`
  variant or a separate `initialInputs: [{data, delay}]` field. v1 is
  one blob.
- **Detecting whether the agent actually consumed the input**. If the
  agent ignores stdin, the input sits in its buffer or gets discarded
  on exit. Not our concern.
- **Removing `-p` support** from any agent's `args`. Users who prefer
  Claude's print mode can keep it — `initialInput` and `-p` are not
  mutually exclusive in yaml (though using both is redundant).
- **Backing off / retrying on transient `EPIPE`** at initial-write
  time. If the child dies during startup, the write throws; we log and
  let the existing crash-handling take over.
