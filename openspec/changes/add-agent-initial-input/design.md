## Context

`add-agent-runner` and `add-agent-stdin-relay` together give us:
- A spawned agent process per change
- A stdin pipe writable at any time from the dashboard

What's still missing is **how the agent gets its first prompt**.
Passing `/opsx:apply add-vscode-extension` via `args` works only for
CLIs that treat positional args as a prompt. Modern coding CLIs
(Claude, Aider, Codex) treat them as flags — so the prompt lands in the
void and the CLI silently waits for stdin.

Two industry patterns for "give the CLI a task on startup":

1. **A CLI-specific print flag** (`claude -p "..."`, `aider --message "..."`).
   Portable across releases of that one CLI, but each CLI names it
   differently and any given flag can be removed.
2. **Write to stdin.** Every REPL that reads stdin accepts it. This is
   the Unix contract; it's stable in a way per-CLI flags are not.

We pick (2) because:
- It composes with `add-agent-stdin-relay`. The initial write goes down
  the same pipe as any subsequent user response.
- It sidesteps the "which flag does this CLI use this month" question.
- The current pain (Claude idling on `no stdin data received`) is
  exactly what (2) solves.

## Goals / Non-Goals

**Goals:**
- One optional field in `agents.yaml` that captures the initial prompt
- The field supports the same `${change_id}` / `${worktree_path}` /
  `${branch}` template variables as `args`/`env`
- The write happens exactly once, after spawn, before any user
  interaction is possible
- The written bytes appear in the job transcript as `stream: "stdin"`,
  matching the relay's echo convention
- Zero behavior change when the field is absent

**Non-Goals:**
- Multi-step initial input (delays, sequences)
- Detecting whether the agent read the input
- Rewriting `args` semantics — `args` remains flags/positional as it is
- Deprecating alternative approaches (`-p`, `--message`, etc.); users
  can still put those in `args` if they prefer

## Decisions

### Field name: `initialInput`

Considered:
- `stdin` — too generic; sounds like a whole stream config, not "the
  first prompt."
- `prompt` — LLM-specific; the runner is agent-agnostic (could be a
  script that reads stdin for a task queue).
- `initialInput` — describes the mechanism, not the tool, and reads
  correctly next to `args` / `env`.

Choice: **`initialInput`**.

### Type: single string, not an array

v1 accepts a single string. Delimiters and multi-line prompts are
handled by embedding newlines in the string itself:

```yaml
initialInput: |
  /opsx:apply ${change_id}
  Please also review docs/roadmap.md
```

An array variant (`initialInputs: [{data, delayMs}]`) is a natural
future extension for CLIs that need staged input. Deferred.

### Newline handling

Append a single trailing `\n` if the string doesn't already end with
one. This matches most REPLs' expectations. YAML block scalars often
strip trailing newlines; users who need no-newline can post-process
via `\n` embedded literally at the end (rare).

### Timing: immediately after `spawn`, no delay

We write as soon as `spawn` returns and `child.stdin` reports writable.
No `setTimeout` — the child's stdin has a Node-level buffer that
accepts writes before the child has even started reading. Any latency
the child needs to boot happens inside the child; the runner doesn't
have to guess.

Rejected alternative: **wait for first output before writing**. Too
brittle — CLIs that print no banner (e.g. print-mode-suppressed) never
trigger the write; complexity does not pay off.

### Echo into ring buffer

The initial write appears in the job's output as a `stream: "stdin"`
line, same shape as `add-agent-stdin-relay`'s user echoes. This makes
the transcript self-contained and consistent — a reviewer sees
"[stdin] /opsx:apply add-vscode-extension" as the first line, followed
by the CLI's response.

### Failure handling

If the initial write throws (e.g. child died during spawn), the runner
logs the error and lets the existing crash path handle finalization.
The job transitions to `crashed` naturally on child exit. No special
retry / backoff.

### Interaction with `args`

`args` still carries flags. `initialInput` carries the prompt. They are
orthogonal. Example for Claude:

```yaml
- name: claude
  command: claude
  args: ["--dangerously-skip-permissions"]      # optional YOLO
  initialInput: "/opsx:apply ${change_id}"
```

## Alternatives considered

- **Auto-detect and rewrite common CLIs**. Rejected: heuristics rot;
  the yaml is fewer moving parts.
- **Make `initialInput` mandatory**. Rejected: some agents legitimately
  need only `args` (`node script.js` style batch runs).
- **Two separate concepts: `prompt` for LLMs and `stdin` for scripts**.
  Rejected: the runner treats them identically; one field is enough.
- **Send the initial input via a separate pipe (`stdio[3]`)**. Rejected:
  requires the child to know to read `fd 3`; stdin is the universal
  contract.

## Risks

- **YAML block-scalar traps**. Users writing multi-line prompts may
  accidentally strip newlines with `|-` vs. `|`. Documented in the
  example file.
- **Template variables in prompts.** If a user's prompt contains a `$`
  that shouldn't be substituted, they need to escape it. The template
  engine already supports this by requiring `${name}` syntax; a bare
  `$foo` is passed through untouched.
- **Agents that don't read stdin.** The initial write goes into a
  buffer the child never reads; the buffer is torn down when the child
  exits. No leak, no error.
