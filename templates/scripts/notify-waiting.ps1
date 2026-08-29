# SPDX-License-Identifier: MIT
param([string]$CliName = "CLI")
$title = "ithyno — CLI waiting"
$body = "$CliName is waiting for your input"

try {
  if (Get-Command New-BurntToastNotification -ErrorAction SilentlyContinue) {
    New-BurntToastNotification -Text $title, $body
    exit 0
  }
} catch { }

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
