## Context

The dashboard historically used `commandStyle` (`claude` versus `cli`) to
choose a command string. That setting does not identify the actual active
Manager: a project may have a Codex Manager while using the same terminal UI.
Some paths now query the configured Manager, but others still embed slash
strings locally.

## Goals

- Resolve a command from its namespace, operation, arguments, and active
  Manager command in one place.
- Preserve all established Claude/non-Codex and CLI-mode behavior.
- Cover every existing product path that writes an agent command to a terminal
  or Manager PTY.

## Non-goals

- Changing the behavior or argument grammar of OpenSpec/ithyno skills.
- Porting additional worker-only skills; that remains in
  `add-codex-native-command-aliases`.
- Rewriting historical documentation that describes the Claude command syntax.

## Decision

Create a small pure resolver with an operation-oriented API. It accepts the
selected Manager's command and returns either a slash command or the Codex
flat-name command. UI components obtain the active Manager from the Agents
store; server entry points obtain it from the loaded agent registry. CLI-mode
paths continue to return their existing `npx openspec` or `git` commands.

The resolver owns the mappings:

| Namespace | Non-Codex | Codex |
| --- | --- | --- |
| `opsx` | `/opsx:<operation>` | `openspec-<operation>` |
| `ithy-opsx` | `/ithy-opsx:<operation>` | `ithy-opsx-<operation>` |

Arguments are appended unchanged by the caller after normal shell quoting.

## Risks and mitigations

- **A new action bypasses the resolver.** Keep all direct command construction
  out of action components and add an inventory-oriented regression test.
- **No Manager is configured.** Treat it as non-Codex, retaining current slash
  command fallback rather than blocking an established workflow.
- **CLI mode accidentally changes.** Test its existing commands independently;
  it does not use the Codex prompt namespace.
