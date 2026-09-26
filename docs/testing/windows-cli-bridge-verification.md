# Windows CLI bridge verification

This handout reproduces on native Windows the CLI bridge checks performed on
macOS for two simultaneous ithyno projects. Use disposable test projects. Do
not run the write-operation section against a real project.

## Current implementation status

The current `add-ithyno-cli-mcp-bridge` change deliberately disables the
Windows bridge transport until both of these protections are implemented and
verified:

- the named pipe is restricted to the owning Windows user SID;
- remote named-pipe clients are rejected.

Until that work is complete, `ithyno bridge ...` on Windows is expected to
return an `unsupported` result and exit code `15`. That is the secure
fail-closed result, not a successful bridge verification.

Run sections 1-3 and 9 now to verify package installation, diagnostics, and
explicit MCP configuration. Run sections 4-8 after the Windows named-pipe
transport is enabled. Do not mark the Windows bridge complete while the
expected result is still `unsupported`.

## 1. Prerequisites

Use native Windows PowerShell, not a mixture of Windows and WSL processes.

```powershell
git --version
node --version
npm --version
```

Required:

- Windows 10 or Windows 11;
- Git for Windows;
- a supported Node.js LTS release;
- two disposable, Git-initialized OpenSpec projects;
- the ithyno source checkout or a release/debug package containing the change
  under test.

Set paths for the rest of the handout:

```powershell
$Repo = (Resolve-Path 'C:\src\ithyno').Path
$ProjectA = (Resolve-Path 'C:\src\test-proj-a').Path
$ProjectB = (Resolve-Path 'C:\src\test-proj-b').Path
$PortA = 4322
$PortB = 4323
```

Both projects must contain `openspec\`. Confirm before continuing:

```powershell
Test-Path "$ProjectA\openspec"
Test-Path "$ProjectB\openspec"
```

Both commands must print `True`.

## 2. Install the exact package under test

Prefer a packed artifact over a global `ithyno` executable. This reproduces
the dependency layout users receive and catches hoisted dependency problems.

```powershell
$PackDir = Join-Path $env:TEMP 'ithyno-bridge-package'
New-Item -ItemType Directory -Force $PackDir | Out-Null

Push-Location $Repo
npm pack --pack-destination $PackDir
Pop-Location

$Tarball = Get-ChildItem $PackDir -Filter 'ithyno-*.tgz' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $Tarball) { throw 'ithyno package was not created' }

Push-Location $ProjectA
npm install --save-dev $Tarball.FullName
Pop-Location

Push-Location $ProjectB
npm install --save-dev $Tarball.FullName
Pop-Location
```

Resolve each project's installed executable explicitly. This prevents the
third PowerShell window from selecting a global executable or a package from
its own current directory.

```powershell
$IthynoA = Join-Path $ProjectA 'node_modules\.bin\ithyno.cmd'
$IthynoB = Join-Path $ProjectB 'node_modules\.bin\ithyno.cmd'

if (-not (Test-Path $IthynoA)) { throw 'Project A ithyno executable is missing' }
if (-not (Test-Path $IthynoB)) { throw 'Project B ithyno executable is missing' }
```

When working interactively from inside either project,
`npx --no-install ithyno ...` is equivalent and prevents npm from silently
downloading a different release.

Confirm that both projects resolve the intended local package:

```powershell
Push-Location $ProjectA
npm ls ithyno tsx --depth=1
Pop-Location

Push-Location $ProjectB
npm ls ithyno tsx --depth=1
Pop-Location
```

`tsx` may be hoisted to the project's top-level `node_modules`. It is not
required to exist at `node_modules\ithyno\node_modules\tsx`.

### Verify initialization from a packaged client

When testing an Electron debug package or an installed VSIX, also create one
fresh disposable project through **New Project**. The initialization flow must:

1. create the selected directory when it does not exist;
2. initialize Git before writing `agents.yaml`;
3. install OpenSpec and the matching project-local `ithyno` development
   dependency; and
4. render workflows that invoke `npx --no-install ithyno bridge ...`.

Verify the resulting project from PowerShell:

```powershell
$InitializedProject = (Resolve-Path 'C:\src\test-proj-from-client').Path
Push-Location $InitializedProject

git rev-parse --show-toplevel
npm ls ithyno --depth=0
npx --no-install ithyno doctor --json

Pop-Location
```

The installed `ithyno` version must match the client build being tested. A
debug Electron or VSIX package uses its bundled checkout tarball; a release
client uses the version-matched GitHub Release tarball. It must not silently
download an unrelated registry version or select a global `ithyno` executable.

## 3. Verify `doctor` from the installed layout

```powershell
$DoctorA = & $IthynoA doctor --json
$DoctorAExit = $LASTEXITCODE
$DoctorA | ConvertFrom-Json | ConvertTo-Json -Depth 8
if ($DoctorAExit -notin @(0, 1)) {
  throw "Project A doctor could not run: $DoctorAExit"
}

$DoctorB = & $IthynoB doctor --json
$DoctorBExit = $LASTEXITCODE
$DoctorB | ConvertFrom-Json | ConvertTo-Json -Depth 8
if ($DoctorBExit -notin @(0, 1)) {
  throw "Project B doctor could not run: $DoctorBExit"
}
```

Pass criteria:

- JSON is returned;
- `Cannot find module ... node_modules\ithyno\node_modules\tsx` is absent;
- `readyForManager` reflects the installed prerequisites;
- no dashboard token or private environment value is printed.

## 4. Start two projects simultaneously

Open two PowerShell windows.

Window A:

```powershell
Set-Location $ProjectA
& $IthynoA start --port $PortA --no-open
```

Window B:

```powershell
Set-Location $ProjectB
& $IthynoB start --port $PortB --no-open
```

Keep both processes running. The HTTP ports are intentionally different, but
the bridge must resolve projects through the runtime registry and named pipes;
it must not discover either project by scanning these ports.

## 5. Verify exact project routing

Use a third PowerShell window:

```powershell
$StatusA = & $IthynoA status --project $ProjectA --json |
  ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Project A bridge status failed' }

$StatusB = & $IthynoB status --project $ProjectB --json |
  ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Project B bridge status failed' }

$StatusA | ConvertTo-Json -Depth 8
$StatusB | ConvertTo-Json -Depth 8

if ($StatusA.projectRoot -eq $StatusB.projectRoot) {
  throw 'Both calls resolved to the same project root'
}
if ($StatusA.projectHash -eq $StatusB.projectHash) {
  throw 'Both calls resolved to the same project hash'
}
if ($StatusA.result.runtime.pid -eq $StatusB.result.runtime.pid) {
  throw 'Both calls resolved to the same server process'
}
if ($StatusA.result.runtime.ipcAddress -eq $StatusB.result.runtime.ipcAddress) {
  throw 'Both calls resolved to the same named pipe'
}
```

Pass criteria:

- each result reports its requested canonical project root;
- project hashes, PIDs, and named-pipe addresses differ;
- neither result contains a dashboard session token;
- neither call uses or recommends `localhost:4321` as a fallback.

## 6. Verify canonical routing through a junction

A directory junction works without Developer Mode and exercises realpath-style
canonicalization on Windows.

```powershell
$JunctionRoot = Join-Path $env:TEMP 'ithyno-bridge-junction-test'
$ProjectAJunction = Join-Path $JunctionRoot 'project-a'
New-Item -ItemType Directory -Force $JunctionRoot | Out-Null
New-Item -ItemType Junction -Path $ProjectAJunction -Target $ProjectA | Out-Null

$LinkedStatus = & $IthynoA status `
  --project $ProjectAJunction --json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Junction bridge status failed' }

if ($LinkedStatus.projectRoot -ne $StatusA.projectRoot) {
  throw 'Junction did not resolve to Project A canonical root'
}
if ($LinkedStatus.projectHash -ne $StatusA.projectHash) {
  throw 'Junction created a second project identity'
}

Remove-Item $ProjectAJunction
Remove-Item $JunctionRoot
```

The junction call must return Project A's canonical root and the same project
hash. It must not create a second descriptor.

## 7. Verify independent shutdown

Press `Ctrl+C` only in Window A. Leave Project B running, then execute:

```powershell
& $IthynoA status --project $ProjectA --json
if ($LASTEXITCODE -ne 10) {
  throw "Stopped Project A should be unavailable (10), got $LASTEXITCODE"
}

& $IthynoB status --project $ProjectB --json
if ($LASTEXITCODE -ne 0) {
  throw "Project B was affected by Project A shutdown: $LASTEXITCODE"
}
```

Pass criteria:

- Project A returns `unavailable` with exit code `10`;
- Project B still returns success;
- stopping Project A does not remove or replace Project B's descriptor;
- no call silently connects to the other project.

After recording the result, press `Ctrl+C` in Window B.

## 8. Verify the CLI operation surface

Restart the disposable project that will be used for this section. Read-only
operations can always be checked:

```powershell
& $IthynoA bridge changes --project $ProjectA --json
& $IthynoA bridge jobs --project $ProjectA --json
& $IthynoA bridge needs-human `
  --project $ProjectA --change-id '<test-change-id>' --json
```

Run the following only with a disposable change and disposable worker
configuration. Record the original phase before changing it and restore it at
the end.

```powershell
& $IthynoA bridge phase `
  --project $ProjectA --change-id '<test-change-id>' --phase proposed --json

& $IthynoA bridge activity `
  --project $ProjectA --change-id '<test-change-id>' `
  --role code --activity waiting --message 'Windows bridge verification' --json

& $IthynoA bridge dispatch `
  --project $ProjectA --change-id '<test-change-id>' `
  --role code --execution-mode worktree --json

& $IthynoA bridge jobs --project $ProjectA --json

& $IthynoA bridge cancel `
  --project $ProjectA --job '<job-id>' --json

& $IthynoA bridge needs-human `
  --project $ProjectA --change-id '<needs-human-change-id>' `
  --answer 'Windows bridge verification answer' --json
```

Pass criteria:

- every command returns the versioned JSON envelope and the requested project
  identity;
- dispatch returns a job ID;
- jobs returns that job and cancellation targets only that ID;
- needs-human read/answer operates only on the requested change;
- write operations create redacted audit events;
- no result contains `ITHYNO_SESSION_TOKEN`, authorization headers, dotenv
  private keys, or another project's data.

## 9. Verify explicit MCP setup

Project initialization must not enable MCP automatically. Check the initial
state, install the project-scoped Codex entry, and remove it again:

```powershell
& $IthynoA mcp status --project $ProjectA
& $IthynoA mcp install --project $ProjectA
& $IthynoA mcp status --project $ProjectA

Get-Content (Join-Path $ProjectA '.codex\config.toml')

& $IthynoA mcp remove --project $ProjectA
& $IthynoA mcp status --project $ProjectA
```

Pass criteria:

- the first status reports that the project-scoped MCP entry is absent;
- install is idempotent and creates one `ithyno` MCP server entry;
- the entry starts the project-local CLI with `mcp serve` and identifies the
  selected project, but contains no dashboard URL, port, or session token;
- remove deletes only the ithyno entry and preserves unrelated MCP servers;
- while Windows bridge transport is disabled, an MCP tool call fails with the
  same sanitized `unsupported` result instead of attempting HTTP or port 4321.

Use `--global` only for a deliberate user-wide Codex configuration check. It
is not part of ordinary project initialization and should not be used on a
shared Windows test account.

## 10. Evidence to retain

Record the following in the change review or test report:

- Windows edition, version, and build (`winver`);
- CPU architecture;
- `node --version`, `npm --version`, and installed ithyno version;
- whether the package came from `npm pack`, VSIX, Electron debug packaging, or
  a release artifact;
- the initialized project's `npm ls ithyno --depth=0` result and whether Git
  was created before `agents.yaml`;
- Project A/B canonical roots, hashes, PIDs, and named-pipe addresses;
- junction result;
- Project A unavailable result after shutdown and Project B success result;
- results of each CLI operation tested;
- MCP status before install, after install, and after remove;
- confirmation that output contained no credentials;
- any antivirus, AppLocker, sandbox, or named-pipe permission error.

Do not include dashboard URLs containing tokens in the retained evidence.
