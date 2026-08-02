## MODIFIED Requirements

### Requirement: Manager Entry Drives Fresh PTY Startup

The server SHALL resolve the embedded PTY session's startup command via a three-tier priority chain whenever a fresh child is about to be spawned (initial connection or reconnect that spawns a new process). This resolution is independent of any tmux wrapping applied later:

1. **`registry.managerAgent()`** — the first `agents.yaml` entry whose `roles` array contains `manager`. Its `command` + `args` form the startup line. When `args` is EMPTY, the server SHALL defer to the per-CLI Manager-startup dispatch (see the "Manager PTY startup dispatches per CLI when args are empty" requirement); when `args` is non-empty, those args are used verbatim (explicit override). If the entry defines `initialInput` (either as a top-level field pre-reshape or as `prompts.manager` post-reshape), that string SHALL be written to the child's stdin after the startup command settles.
2. **`ITHYNO_TERMINAL_STARTUP` env var** — treated as a single shell string, tokenised on whitespace with standard shell quoting.
3. **Per-project Claude Code session file fallback** — the server SHALL read / mint a UUID at `<projectRoot>/.ithyno/session-claude` and pick `claude --session-id <uuid>` on first launch (file missing or empty), `claude --resume <uuid>` on subsequent launches. The legacy path `<projectRoot>/.ithyno/session-id` SHALL be read as a fallback for existing dev environments but MUST NOT be written (fresh mints go to `session-claude`). `--continue` MUST NOT be used at this tier.

The chain SHALL be evaluated identically whether or not `agents.yaml` declares an `agmsg:` block.

Live PTY sessions SHALL NOT be restarted on `agents.yaml` reload — only the NEXT fresh spawn picks up a changed manager entry.

#### Scenario: Manager entry with explicit non-empty args wins over dispatch
- **GIVEN** `agents.yaml` has a manager entry `command: claude, args: [--dangerously-skip-permissions]`
- **WHEN** a fresh PTY session opens
- **THEN** the child startup line is `claude --dangerously-skip-permissions`
- **AND** the per-CLI dispatch is NOT consulted

#### Scenario: Manager entry with empty args defers to per-CLI dispatch
- **GIVEN** `agents.yaml` has a manager entry `command: claude, args: []`
- **WHEN** a fresh PTY session opens with a `projectRoot` known
- **THEN** the startup line matches `claude --session-id <uuid>` on first launch (mints `<projectRoot>/.ithyno/session-claude`)
- **OR** matches `claude --resume <uuid>` on subsequent launches (reads that file)
- **AND** the value is NOT `claude --continue`

#### Scenario: Legacy `.ithyno/session-id` is honored as fallback read
- **GIVEN** an existing dev environment where `<projectRoot>/.ithyno/session-id` contains a UUID and `session-claude` does NOT exist
- **WHEN** a fresh PTY session opens for a Claude manager with empty args (or no manager entry at all — priority 3)
- **THEN** the startup line is `claude --resume <legacy-uuid>` (legacy file read)
- **AND** no rewrite of the legacy file occurs (it stays as-is)
- **AND** subsequent runs continue to read the legacy file until a fresh mint writes to `session-claude`

#### Scenario: Env var priority preserved
- **GIVEN** no manager entry AND `ITHYNO_TERMINAL_STARTUP=claude` is set AND `.ithyno/session-claude` exists with a UUID
- **WHEN** a fresh PTY session opens
- **THEN** the child startup line is `claude` (from env var)
- **AND** the session-claude file is NOT consulted

## ADDED Requirements

### Requirement: Manager PTY startup dispatches per CLI when args are empty

The server SHALL expose a per-CLI Manager-startup dispatch table (`MANAGER_STARTUP_STRATEGIES` in `server/sync/pty.ts`) mapping each Manager-eligible CLI id to a strategy function `(projectRoot: string | undefined) => string`. When a Manager entry in `agents.yaml` has an empty `args` array, the server SHALL invoke the strategy registered for `manager.command`; when no strategy is registered for the command, the server SHALL emit the command as-is (plain `<cli>` — safe first-launch default).

The `claude` strategy SHALL implement the session-file mint/resume contract described in `Manager Entry Drives Fresh PTY Startup` priority 3, using `<projectRoot>/.ithyno/session-claude` as the canonical location. New CLI strategies SHALL be added to the table as their per-CLI resume semantics are researched and implemented; each addition is its own follow-up change.

The dispatch function `resolveManagerStartup(command, projectRoot)` SHALL be exported for direct testing.

#### Scenario: claude strategy mints session file on fresh project
- **GIVEN** a fresh project directory with no `.ithyno/session-claude` and no `.ithyno/session-id`
- **WHEN** `resolveManagerStartup("claude", projectRoot)` is called
- **THEN** the return value matches `claude --session-id <uuid>` where `<uuid>` is a fresh UUID
- **AND** `.ithyno/session-claude` is created containing that UUID

#### Scenario: unregistered CLI falls back to plain command
- **GIVEN** the dispatch table has no entry for `codex`
- **WHEN** `resolveManagerStartup("codex", "/any/path")` is called
- **THEN** the return value is exactly `"codex"` (no args, no `--continue`, no other flag)

#### Scenario: registered strategy without projectRoot returns plain command
- **GIVEN** the claude strategy is registered
- **WHEN** `resolveManagerStartup("claude", undefined)` is called (no projectRoot for session file lookup)
- **THEN** the return value is exactly `"claude"`

#### Scenario: template default (empty args) triggers dispatch, not `--continue`
- **GIVEN** a fresh project initialized by `openspec init` with `agents.yaml.tmpl`'s default (empty `args: []`)
- **WHEN** the first PTY session opens
- **THEN** the startup line does NOT contain `--continue`
- **AND** if the manager command is `claude`, the startup line uses the session-file mint/resume dispatch

### Requirement: Manager picker filters to Manager-eligible CLIs with unverified label

The Init flow's Manager-CLI picker (`web/src/components/InitDialog.tsx`) SHALL offer only Manager-eligible CLIs. The eligibility set is the union of two constants: `MANAGER_VERIFIED` (currently `["claude"]`) and `MANAGER_UNVERIFIED` (currently `["codex", "agy"]`).

Non-eligible CLIs (`copilot`, `gemini`, `opencode`, `cursor`, `antigravity`) SHALL be hidden from the Manager picker. They MAY still appear in the Prerequisites list and MAY still be spawned as agmsg workers — the filter applies only to the Manager role.

Entries in `MANAGER_UNVERIFIED` SHALL render with a trailing `(動作未確認)` (Japanese for "operation unverified") label. A CLI SHALL be moved from `MANAGER_UNVERIFIED` to `MANAGER_VERIFIED` (removing the label) once both: (a) it has a startup strategy registered in `MANAGER_STARTUP_STRATEGIES`, AND (b) its dispatch skill resolves in that CLI's command surface (currently blocked pending `generalize-skills-cross-cli` renderer follow-ups for non-Claude CLIs).

`readyForManager` SHALL be derived from `managerChoices.length > 0` (installed ∩ candidates), not from the raw doctor report's field — a project with only non-eligible CLIs installed correctly reports "no Manager-eligible CLI" and blocks Init.

The preselect logic SHALL respect the candidate filter: the stored `defaultManager` is preselected only if it is both installed AND Manager-eligible; otherwise the picker preselects the first eligible-installed CLI by `CLI_PRIORITY`.

#### Scenario: picker shows only Manager candidates
- **GIVEN** doctor reports `claude`, `copilot`, `gemini` as installed
- **WHEN** the Init dialog renders
- **THEN** the Manager picker shows exactly `claude` (the only eligible CLI in the installed set)
- **AND** `copilot` and `gemini` appear in the Prerequisites list but NOT in the Manager picker

#### Scenario: unverified CLIs get the 動作未確認 label
- **GIVEN** doctor reports `claude`, `codex`, `agy` as installed
- **WHEN** the Init dialog renders
- **THEN** the Manager picker shows all three
- **AND** the `codex` and `agy` entries render with a `(動作未確認)` suffix
- **AND** the `claude` entry renders without the suffix

#### Scenario: no eligible CLI installed blocks Init
- **GIVEN** doctor reports only `copilot` and `gemini` as installed
- **WHEN** the Init dialog renders
- **THEN** the Manager picker section is not shown
- **AND** `readyForManager` is false
- **AND** the "No agent CLI installed" (or equivalent) blocking message appears

#### Scenario: defaultManager honored only if eligible
- **GIVEN** the store's `defaultManager` is `gemini` (which is not Manager-eligible) AND doctor reports `claude` and `gemini` installed
- **WHEN** the Init dialog renders
- **THEN** the picker preselects `claude` (first eligible-installed by priority)
- **AND** does NOT preselect `gemini`

#### Scenario: agmsg worker path unaffected
- **GIVEN** the Manager picker filter has hidden `copilot` from the Init dialog
- **WHEN** the dispatch flow spawns a Copilot worker via agmsg (an unrelated concern)
- **THEN** the worker still spawns successfully
- **AND** the picker filter has NO effect on worker CLI selection or spawn
