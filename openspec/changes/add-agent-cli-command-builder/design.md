## Context

The Agent dialog currently edits `command` and flattens a whitespace-separated Args input into `args[]`. Claude Code, Codex, Antigravity CLI, and GitHub Copilot CLI expose overlapping concepts with different flags and accepted values. Their installed versions and available models can also differ by machine, account, and model gateway.

The implementation evidence and exact locally observed CLI outputs are recorded in [`docs/ideas/2026-10-06-agent-cli-command-builder-research.md`](../../../docs/ideas/2026-10-06-agent-cli-command-builder-research.md). That document is an implementation input, not a static model catalog.

The dispatcher already owns prompt delivery (`-p`, `exec`, or the CLI-specific equivalent), worktree selection, and lifecycle control. A command builder must therefore configure only the user-owned launch options and must not duplicate dispatcher-owned arguments.

Current CLI inspection shows the following stable categories, subject to installed-version probing:

| CLI | Builder-oriented flags | Model discovery |
| --- | --- | --- |
| Claude Code | `--model`, `--effort`, `--permission-mode`, `--dangerously-skip-permissions` | Interactive `/model`; no supported non-interactive list command was found |
| Codex | `--model`, `--profile`, `--sandbox`, `--ask-for-approval`, `--approve-for-me`, `--dangerously-bypass-approvals-and-sandbox` | App-server `model/list`, with manual fallback |
| Agy | `--model`, `--effort`, `--mode`, `--sandbox`, `--dangerously-skip-permissions` | `agy models` |
| Copilot | `--model`, `--reasoning-effort`, `--context`, `--auto-tier`, tool/path/URL allow controls, `--yolo` | Interactive `/model`; no supported non-interactive list command was found |

This table is adapter input, not a permanent claim that every version supports every option. Runtime help probing decides which controls are enabled.

## Goals / Non-Goals

**Goals:**

- Make common Agent launch options selectable without requiring users to memorize CLI syntax.
- Inspect the executable actually selected by the user and expose its version, supported builder options, and models when the CLI provides a bounded machine-readable/list command.
- Preserve existing and future arguments that the builder does not recognize.
- Keep the resulting `agents.yaml` compatible with current readers and runners.
- Prevent discovery from executing arbitrary commands or hanging the dashboard.

**Non-Goals:**

- Managing CLI authentication, subscriptions, or provider credentials.
- Maintaining a hard-coded authoritative catalog of account-specific models.
- Replacing each CLI's interactive model picker.
- Moving prompt, worktree, or subprocess routing responsibilities from `AgentRegistry`/`AgentRunner` into the UI.
- Supporting arbitrary executable discovery supplied by a remote client.

## Decisions

### 1. Use an allow-listed CLI adapter registry

The server will recognize canonical commands for `claude`, `codex`, `agy`/`antigravity`, and `copilot`. Each adapter defines:

- safe version and help probe argv;
- supported structured fields and their serialization rules;
- dispatcher-owned flags that the builder must not generate;
- an optional model-list probe and parser;
- human-readable fallback instructions when model enumeration is unavailable.

The server will use `spawn`/`execFile`-style argv execution without a shell. A request may select only a known adapter; it cannot supply a probe command line.

Alternative considered: parse every CLI's help text into a complete form dynamically. This is rejected because prose formatting is unstable. Help output is instead used as a compatibility gate for a small adapter-owned field set.

### 2. Probe capabilities on demand with strict bounds

Opening the builder or changing its Command requests inspection from a local authenticated endpoint. Probes have short execution timeouts, output-size limits, sanitized environment handling, and explicit process termination. Results are cached by resolved executable path plus version for the dashboard session.

Model enumeration is attempted only where the adapter has a verified command or protocol. `agy models` and Codex app-server `model/list` are the initial implementations. Claude Code and Copilot fall back to manual entry plus their interactive `/model` guidance. Codex also falls back to manual entry when app-server initialization or discovery fails.

Alternative considered: ship a periodically updated static model list. This is rejected because availability varies by CLI version, account, region, and gateway and would become misleading.

### 3. Keep `command` and `args[]` as the persistence contract

No new builder-only fields are required in `agents.yaml`. The UI parses recognized arguments from the existing `args[]`, edits those values structurally, and writes the merged argv back through the existing Agent config endpoint.

Unknown arguments remain ordered and are displayed in an Advanced args editor. Saving without editing them preserves them byte-for-byte as array elements. Conflicting duplicate recognized flags are surfaced to the user instead of silently discarded.

Alternative considered: persist a second structured builder object. This is rejected because it creates two sources of truth and would require migrations in every consumer.

### 4. Separate user-owned launch options from dispatcher-owned prompt arguments

The builder SHALL NOT add `-p`/`--print`, Codex `exec` prompt content, change IDs, artifact contracts, or other runtime prompt transport. Those remain resolved by `AgentRegistry` and `AgentRunner`. The preview labels the persisted portion separately from the runtime-added prompt portion so users do not confuse the two.

### 5. Provide a staged UI rather than one generic form

The Agent dialog keeps Command selection first. Once the command maps to a supported adapter, the UI presents only fields supported by the installed version. Model is a searchable selector when discovery succeeds and an editable combobox when it does not. Permission and sandbox choices use descriptive options, with dangerous/unattended modes visibly identified. Advanced args and an exact argv preview remain available.

An unknown command continues to use the existing manual Args editor and is never blocked by the builder.

## Risks / Trade-offs

- **CLI help or model output changes** → Keep parsers adapter-local, treat probe failure as non-fatal, and cover recorded outputs with fixtures.
- **A model probe requires login, filesystem access, or network access** → Use a timeout and return an actionable unavailable state; never block saving manual input.
- **Builder overwrites an option it does not understand** → Round-trip unknown argv tokens and test mixed recognized/unrecognized sequences.
- **Quoted values cannot be represented by the current whitespace text field** → Make the canonical UI state an argv array and provide an argv-aware Advanced editor rather than splitting on whitespace at save time.
- **Dangerous approval options become too easy to enable** → Label their impact, require an explicit selection, and do not enable them by default.
- **Windows executable names and process behavior differ** → Resolve adapter aliases independently from the executable path and test `.exe`/`.cmd` invocation and timeout termination on Windows.

## Migration Plan

1. Add the inspection adapters and endpoint without changing Agent persistence.
2. Add parser/serializer tests using existing `args[]` entries and CLI help/model fixtures.
3. Replace the primary Args text field with the structured builder while retaining Advanced args.
4. Verify existing `agents.yaml` files reopen and save without argument drift.
5. Roll back by removing the builder and endpoint; existing files remain valid because their schema is unchanged.

## Open Questions

- Whether future Claude Code or Copilot releases add a non-interactive model-list command. Their adapters can opt in without changing the persistence contract.
