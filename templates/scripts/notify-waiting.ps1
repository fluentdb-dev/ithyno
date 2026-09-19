# SPDX-License-Identifier: MIT
param(
  [string]$CliName = "CLI",
  [ValidateSet("electron", "vscode", "cli")][string]$Context = "cli",
  [string]$HostAppName = "",
  [ValidateSet("stop", "pretooluse")][string]$HookType = "stop"
)

# --- CWD / project name (mirrors notify-waiting.sh) ---
$cwd = if ($env:ITHYNO_PROJECT_ROOT) { $env:ITHYNO_PROJECT_ROOT } else { $PWD.Path }
if (-not [System.Console]::IsInputRedirected) {
  # stdin is a terminal — no JSON to read
} else {
  try {
    $hookInput = [System.Console]::In.ReadToEnd()
    if ($hookInput) {
      $parsed = $hookInput | ConvertFrom-Json -ErrorAction SilentlyContinue
      if ($parsed.cwd) { $cwd = $parsed.cwd }
    }
  } catch { }
}

$projectName = Split-Path $cwd -Leaf
if (-not $projectName) { $projectName = "project" }
$title = "ithyno — CLI waiting"
$body = "$CliName is waiting for your input in $projectName"

# --- Protocol scheme mapping ---
$proto = switch ($HostAppName) {
  "Visual Studio Code" { "vscode" }
  "Cursor"             { "cursor" }
  "Windsurf"           { "windsurf" }
  "Antigravity"        { "antigravity" }
  default              { "" }
}
if ((-not $proto) -and ($Context -eq "electron")) { $proto = "ithyno" }

# --- Notification grouping (match macOS --group "ithyno:$cli_name:$project_id") ---
$notificationTag = "ithyno-$CliName"

# --- BurnToast ---
try {
  if (Get-Command New-BurntToastNotification -ErrorAction SilentlyContinue) {
    if ($proto) {
      # Protocol Activation — clicking the toast brings the host IDE to foreground
      $launchUri = "${proto}://file/${cwd}"
      $text1   = New-BTText -Content $title
      $text2   = New-BTText -Content $body
      $binding = New-BTBinding -Children $text1, $text2
      $visual  = New-BTVisual -BindingGeneric $binding
      $content = New-BTContent -Visual $visual -Launch $launchUri -ActivationType Protocol
      Submit-BTNotification -Content $content -UniqueIdentifier $notificationTag
    } else {
      New-BurntToastNotification -Text $title, $body -UniqueIdentifier $notificationTag
    }
    exit 0
  }
} catch { }

# --- Fallback: NotifyIcon (no click-to-activate) ---
try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $notify = New-Object System.Windows.Forms.NotifyIcon
  $notify.Icon = [System.Drawing.SystemIcons]::Information
  $notify.BalloonTipTitle = $title
  $notify.BalloonTipText = $body
  $notify.Visible = $true
  $notify.ShowBalloonTip(5000)
  Start-Sleep -Milliseconds 250
  $notify.Dispose()
} catch {
  # Hooks are best-effort and must never interrupt the CLI.
}

# Agy hooks require valid JSON on stdout.
# Stop → {}, PreToolUse → {"decision":"allow"} to let the tool proceed.
if ($HookType -eq "pretooluse") {
  Write-Output '{"decision":"allow"}'
} else {
  Write-Output '{}'
}
