$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSEdition -ne 'Desktop') {
  & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $PSCommandPath
  exit $LASTEXITCODE
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$hostScript = Join-Path $repoRoot 'server\windows-bridge-host.ps1'
$pipeName = "ithyno-security-smoke-$PID"
$psi = New-Object Diagnostics.ProcessStartInfo
$psi.FileName = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$psi.Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$hostScript`" -PipeName `"$pipeName`""
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$process = [Diagnostics.Process]::Start($psi)

try {
  $readyTask = $process.StandardOutput.ReadLineAsync()
  if (-not $readyTask.Wait(15000)) { throw 'Windows bridge helper readiness timeout' }
  $ready = $readyTask.Result
  if (-not $ready) { throw "Windows bridge helper failed: $($process.StandardError.ReadToEnd())" }
  if ($ready -notmatch '^READY\t(S-[0-9-]+)\tREMOTE_REJECTED$') {
    throw "Unexpected Windows bridge readiness response: $ready"
  }

  $expectedSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if ($Matches[1] -ne $expectedSid) { throw 'Windows bridge helper reported a different user SID' }

  $client = New-Object IO.Pipes.NamedPipeClientStream(
    '.',
    "LOCAL\$pipeName",
    [IO.Pipes.PipeDirection]::InOut
  )
  try {
    $client.Connect(5000)
    $security = $client.GetAccessControl()
    $rules = @($security.GetAccessRules(
      $true,
      $false,
      [Security.Principal.SecurityIdentifier]
    ))
    $allowed = @($rules | Where-Object AccessControlType -eq Allow)
    if ($allowed.Count -ne 1) {
      throw "Expected exactly one allow ACE, found $($allowed.Count)"
    }
    if ($allowed[0].IdentityReference.Value -ne $expectedSid) {
      throw "Pipe allow ACE belongs to $($allowed[0].IdentityReference.Value), expected $expectedSid"
    }
    if (($allowed[0].PipeAccessRights -band [IO.Pipes.PipeAccessRights]::FullControl) -ne [IO.Pipes.PipeAccessRights]::FullControl) {
      throw 'Current user SID does not have full control of the bridge pipe'
    }

    [pscustomobject]@{
      ok = $true
      currentUserSid = $expectedSid
      allowAceCount = $allowed.Count
      allowAceSid = $allowed[0].IdentityReference.Value
      remoteClients = 'rejected-at-creation'
      sddl = $security.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::All)
    } | ConvertTo-Json -Compress
  }
  finally {
    $client.Dispose()
  }
}
finally {
  if (-not $process.HasExited) { $process.Kill() }
  $process.Dispose()
}
