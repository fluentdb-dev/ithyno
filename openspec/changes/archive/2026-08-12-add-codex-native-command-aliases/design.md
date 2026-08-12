## Context

Codex CLI custom prompts live under `CODEX_HOME/prompts`, unlike Claude's
repository slash-command tree. The OpenSpec Codex adapter currently derives
global prompt paths named `opsx-<id>.md`; ithyno's Codex renderer needs to
preserve the ithy-opsx namespace as `ithy-opsx-<command>`. A global prompt
write is not an acceptable side effect of creating a project.

## Goals

- Make `openspec-propose "test function helloworld"` resolve to the portable
  propose workflow in a Codex-managed project.
- Give ithyno flows equally flat, predictable names such as
  `ithy-opsx-dispatch <change-id>`.
- Keep generated Codex assets project-local without replacing the Manager's
  authenticated runtime home.
- Preserve the existing slash surface for Claude and all non-Codex managers.

## Non-Goals

- Rename Claude commands or the universal skill source namespaces.
- Make Codex a verified Manager before a real interactive smoke test passes.
- Modify global `~/.codex` prompt files.

## Decisions

### D1 — Namespace mapping

The filename and operator mapping is:

| Source namespace | Codex command |
| --- | --- |
| `opsx:<command>` | `openspec-<command>` |
| `ithy-opsx:<command>` | `ithy-opsx-<command>` |

This avoids punctuation that has meaning in the Claude slash-command surface
and gives the two ownership domains readable names.

### D2 — Initialization-only project-scoped CODEX_HOME

When Codex is the selected Manager, the initialization subprocess invokes
OpenSpec with `CODEX_HOME=<project>/.codex`. It can then safely rename its
own generated `opsx-*.md` files to `openspec-*.md` inside the project.
The override is limited to the OpenSpec generation subprocess. The Codex CLI
also reads authentication from `CODEX_HOME/auth.json`; passing the isolated
home to the Manager or workers makes an otherwise authenticated CLI fail.
Runtime therefore receives no ithyno-supplied `CODEX_HOME`. Project-local
skills remain the supported repository surface; project-local prompt
discovery remains behind the live compatibility gate.

### D3 — Manager-specific injection

The frontend shall ask the server/configuration for the active Manager command
or consume it from already-loaded agent configuration, then choose the
injected command through one pure resolver. This prevents each Start surface
from growing separate `if (codex)` branches.

### D4 — Resolve commands per receiving Agent

The Manager's CLI and each worker's CLI can differ. Command resolution must
therefore occur at the final delivery point:

| Role | Claude-shaped command | Codex command |
| --- | --- | --- |
| manager | `/ithy-opsx:dispatch <id>` | `ithy-opsx-dispatch <id>` |
| code | `/opsx:apply <id>` | `openspec-apply-change <id>` plus the code-worker scope contract |
| review | `/ithy-opsx:review <id>` | `ithy-opsx-review <id>` |
| verify | `/ithy-opsx:verify <id>` | `ithy-opsx-verify <id>` |

The resolver accepts the target agent command and role, returning the legacy
string for all non-Codex values. The dispatch process must use it for
subprocess prompts, agmsg boot prompts, and any Manager-mediated delivery.

`ithy-opsx-review` and `ithy-opsx-verify` remain authored as Claude command
files. Initialization converts those command bodies and their frontmatter to
project-local Codex prompts, so Claude remains the single source of truth.
Until that conversion succeeds, the resolver reports the missing skill rather
than emitting a nonfunctional command.

### D5 — Verify invocation, not only files

File-existence tests are insufficient. The change adds a Codex smoke harness
that checks the installed CLI recognizes the project-local prompt name and
passes arguments through. Until that harness is green on the supported Codex
version, Codex remains visibly unverified in New Project.

## Risks

- Codex's interactive custom-prompt trigger spelling can change. The harness
  is the compatibility gate and captures the exact user-facing invocation.
- Existing Codex users may have global OpenSpec prompts. This change does not
  delete or rename them, and it does not redirect their runtime home.
- The command resolver needs the manager identity at injection time. A stale
  config must fall back to the existing slash command rather than blocking
  Start for non-Codex projects.
