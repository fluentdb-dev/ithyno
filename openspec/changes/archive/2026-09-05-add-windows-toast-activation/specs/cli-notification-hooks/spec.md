## ADDED Requirements

### Requirement: Notification script emits an OS-native notification

The scaffolded notification script SHALL display a desktop notification via the
host OS's native mechanism when executed, and SHALL NOT make network requests.

#### Scenario: macOS notification via osascript
- **WHEN** `notify-waiting.sh` executes on macOS
- **THEN** an `osascript -e 'display notification …'` invocation runs, producing a notification in Notification Center

#### Scenario: Linux notification via notify-send
- **WHEN** `notify-waiting.sh` executes on Linux and `notify-send` is present on PATH
- **THEN** a `notify-send` invocation runs, producing a desktop notification

#### Scenario: Windows notification via BurntToast or NotifyIcon fallback
- **WHEN** `notify-waiting.ps1` executes on Windows
- **THEN** the script attempts `New-BurntToastNotification` first, and if the BurntToast module is not available, falls back to `[System.Windows.Forms.NotifyIcon]` so a notification (visual or audible) is produced

#### Scenario: Windows BurnToast notification with Protocol Activation
- **WHEN** `notify-waiting.ps1` executes on Windows with BurnToast available
- **AND** a `$HostAppName` argument is provided that maps to a known protocol scheme (e.g. `"Visual Studio Code"` to `vscode://`)
- **THEN** the toast is created via `New-BTContent -Launch "<proto>://file/<cwd>" -ActivationType Protocol` so that clicking the toast brings the host IDE to the foreground

#### Scenario: Windows BurnToast notification without known host app
- **WHEN** `notify-waiting.ps1` executes on Windows with BurnToast available
- **AND** no `$HostAppName` is provided or it does not map to a known protocol scheme
- **THEN** a plain `New-BurntToastNotification` is shown without Protocol Activation

#### Scenario: Script performs no network I/O
- **WHEN** either notification script executes
- **THEN** it does not open any TCP/UDP socket, and does not read the ithyno server port or auth token from any source
