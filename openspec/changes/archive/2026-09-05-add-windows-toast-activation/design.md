## Context

The macOS `notify-waiting.sh` already implements click-to-activate:

```sh
# alerter path — detached so the hook doesn't block the CLI
nohup sh -c 'result=$(alerter ...); case "$result:$ITHYNO_CONTEXT" in
  @CONTENTCLICKED:electron) open -a ithyno "$cwd" ;;
  @CONTENTCLICKED:vscode)   open -a "$ITHYNO_HOST_APP" "$cwd" ;;
esac' &
```

Windows has no `alerter` equivalent, but BurnToast supports **Protocol
Activation** — Windows delivers a registered protocol URI when the toast is
clicked. The notification-producing `pwsh` process can exit immediately; the OS
handles the activation independently.

## Goals

- Clicking a BurnToast notification on Windows brings the host IDE to the
  foreground, matching the macOS experience.
- Support VS Code, Cursor, Windsurf, and Electron (when protocol registered).
- Zero new runtime dependencies — only BurnToast (already optional).

## Non-Goals

- Electron protocol handler registration (`app.setAsDefaultProtocolClient`) —
  tracked as a follow-up.
- Linux `notify-send` click callbacks — `notify-send` does not support them.

## Design

### Protocol Scheme Mapping

```
$HostAppName               →  Protocol
────────────────────────────────────────
"Visual Studio Code"       →  vscode
"Cursor"                   →  cursor
"Windsurf"                 →  windsurf
"Antigravity"              →  antigravity
(electron context)         →  ithyno
(anything else / cli)      →  (none — no activation)
```

The mapping is a `switch` statement in `notify-waiting.ps1`. New VS Code forks
can be added by extending the switch without structural changes.

Source: `vscode.env.appName` is passed as `hostAppName` through `renderWebviewHtml`
→ Settings API → `installClaudeNotifyHook` → hook command arg. Confirmed values:
VS Code = `"Visual Studio Code"`, Antigravity `product.json` `nameShort` =
`"Antigravity"`, protocol = `antigravity://`.

### BurnToast API

BurnToast's `New-BurntToastNotification` does not expose `-ActivationType`.
We use the lower-level content-builder API:

```powershell
$text1   = New-BTText -Content $title
$text2   = New-BTText -Content $body
$binding = New-BTBinding -Children $text1, $text2
$visual  = New-BTVisual -BindingGeneric $binding
$content = New-BTContent -Visual $visual `
             -Launch "$proto://file/$cwd" `
             -ActivationType Protocol
Submit-BTNotification -Content $content
```

When `$proto` is empty (cli context or unknown host), fall back to the current
simple path: `New-BurntToastNotification -Text $title, $body`.

### CWD / Project Name Extraction

Mirror the macOS script:

1. If stdin is not a terminal, read it and extract `.cwd` via
   `ConvertFrom-Json` (equivalent of `jq -r '.cwd'`).
2. Fall back to `$env:ITHYNO_PROJECT_ROOT`, then `$PWD`.
3. Extract `$projectName` as the last path segment.

### Notification Grouping

Use BurnToast's `-Group` or `-Tag` to match the macOS `--group
"ithyno:$cli_name:$project_id"` behavior (dedup repeated waiting
notifications for the same CLI + project).

## Decisions

- **Protocol URI format**: `<scheme>://file/<cwd>` — VS Code-based IDEs
  handle `vscode://file/<path>` to open a folder. Aligns with documented
  VS Code URI handling.
- **No `-AppId` override**: BurnToast defaults to PowerShell's AppId. This
  means the toast appears under "PowerShell" in Action Center. Changing this
  requires a registered AppUserModelId — not worth the complexity.
- **NotifyIcon fallback unchanged**: `System.Windows.Forms.NotifyIcon` does
  not support click callbacks without a message loop, so it stays fire-and-forget.

## Risks

- If a VS Code fork uses a different protocol scheme, the toast click will
  fail silently (Windows shows "no app found" or opens the Store). Low risk —
  the mapping is easily extensible.
- BurnToast's `New-BTContent` API could change in a future release. Low risk —
  the cmdlets have been stable since BurnToast 0.7.
