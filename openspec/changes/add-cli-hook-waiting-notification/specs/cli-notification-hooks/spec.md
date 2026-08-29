## ADDED Requirements

### Requirement: Init installs OS notification hook into supported CLIs

`openspec-ui init` SHALL install a "response-waiting" notification hook into each supported Manager CLI's configuration (`MANAGER_VERIFIED = ["claude", "agy"]`) present in the target project. The hook SHALL invoke a locally-scaffolded notification script when the CLI enters a waiting-for-user state, without contacting the ithyno server.

#### Scenario: Claude Code hook installed on init
- **WHEN** the user runs `openspec-ui init` in a project directory that contains `.claude/settings.json` (or where init creates one)
- **THEN** `.claude/settings.json` includes an entry under both `hooks.Notification` and `hooks.Stop` whose `command` is the absolute path to the scaffolded notification script

#### Scenario: agy hook installed on init
- **WHEN** the user runs `openspec-ui init` in a project targeting agy as a Manager candidate
- **THEN** agy's hook configuration file includes an entry that fires the scaffolded notification script on agy's response-completed / awaiting-input event (equivalent semantics to Claude Code's Notification+Stop)

#### Scenario: Unsupported Manager CLIs are skipped without error
- **WHEN** the user runs `openspec-ui init` and the target project has no `MANAGER_VERIFIED` CLI configured
- **THEN** init completes successfully and no hook configuration is modified

### Requirement: Notification script is host-OS specific

Init SHALL scaffold exactly one notification script matching the host operating system into `.ithyno/scripts/`, and SHALL make it executable.

#### Scenario: macOS scaffolds sh script only
- **WHEN** init runs on macOS
- **THEN** `.ithyno/scripts/notify-waiting.sh` exists with mode `0755` and no `notify-waiting.ps1` is created

#### Scenario: Linux scaffolds sh script only
- **WHEN** init runs on Linux
- **THEN** `.ithyno/scripts/notify-waiting.sh` exists with mode `0755` and no `notify-waiting.ps1` is created

#### Scenario: Windows scaffolds ps1 script only
- **WHEN** init runs on Windows
- **THEN** `.ithyno/scripts/notify-waiting.ps1` exists and no `notify-waiting.sh` is created

### Requirement: Notification script emits an OS-native notification

The scaffolded notification script SHALL display a desktop notification via the host OS's native mechanism when executed, and SHALL NOT make network requests.

#### Scenario: macOS notification via osascript
- **WHEN** `notify-waiting.sh` executes on macOS
- **THEN** an `osascript -e 'display notification …'` invocation runs, producing a notification in Notification Center

#### Scenario: Linux notification via notify-send
- **WHEN** `notify-waiting.sh` executes on Linux and `notify-send` is present on PATH
- **THEN** a `notify-send` invocation runs, producing a desktop notification

#### Scenario: Windows notification via BurntToast or NotifyIcon fallback
- **WHEN** `notify-waiting.ps1` executes on Windows
- **THEN** the script attempts `New-BurntToastNotification` first, and if the BurntToast module is not available, falls back to `[System.Windows.Forms.NotifyIcon]` so a notification (visual or audible) is produced

#### Scenario: Script performs no network I/O
- **WHEN** either notification script executes
- **THEN** it does not open any TCP/UDP socket, and does not read the ithyno server port or auth token from any source

### Requirement: Hook installation preserves existing user hooks

Init SHALL merge the ithyno hook entry into the CLI's existing hook configuration without discarding or overwriting user-authored hook entries.

#### Scenario: Existing user hook is preserved
- **WHEN** init runs in a project whose `.claude/settings.json` already contains a user-authored entry under `hooks.Notification`
- **THEN** after init, both the user's entry AND the ithyno entry are present in `hooks.Notification`

#### Scenario: Re-running init is idempotent
- **WHEN** init runs a second time in a project where the ithyno hook entry is already present
- **THEN** no duplicate ithyno entry is added and the configuration file is left semantically unchanged

#### Scenario: --force replaces the ithyno entry only
- **WHEN** the user runs `openspec-ui init --force` in a project where the ithyno hook entry is already present
- **THEN** the ithyno entry is rewritten with the currently-scaffolded script path and any other user-authored entries are preserved

### Requirement: Hook path is absolute at install time

The `command` value written into the CLI's hook configuration SHALL be the absolute filesystem path of the scaffolded notification script at the moment init runs.

#### Scenario: Absolute path in Claude Code hook
- **WHEN** init writes a hook entry into `.claude/settings.json`
- **THEN** the entry's `command` field is an absolute path (starts with `/` on POSIX, drive-letter on Windows) pointing at the scaffolded script under the target project's `.ithyno/scripts/`

### Requirement: No dependency on ithyno server state

The notification pathway SHALL function entirely without the ithyno server process running, and SHALL NOT reference any server port or authentication token at hook-install time or hook-execution time.

#### Scenario: Hook fires with ithyno server not running
- **WHEN** the ithyno server process is stopped and the CLI's response-waiting hook fires
- **THEN** the OS notification is still produced

#### Scenario: No server env vars in scaffold or execution
- **WHEN** init installs the hook, and later when the hook executes
- **THEN** neither operation reads or writes `ITHYNO_LAUNCHER_SESSION_TOKEN`, `ITHYNO_PORT`, or the equivalent auth/port variables

### Requirement: User can disable notifications by removing the script

Users SHALL be able to stop notifications by removing (or making non-executable) the scaffolded notification script under `.ithyno/scripts/`, without editing CLI configuration files.

#### Scenario: Removing the script silences notifications
- **WHEN** the user deletes `.ithyno/scripts/notify-waiting.sh` (or `.ps1`) and the CLI's response-waiting hook subsequently fires
- **THEN** no notification is produced and the CLI continues to run normally (any hook error is non-fatal to the CLI itself)
