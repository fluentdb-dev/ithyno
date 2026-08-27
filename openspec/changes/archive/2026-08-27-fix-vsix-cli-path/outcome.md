## Worked

- Windows-only guard (`process.platform !== 'win32'`) keeps non-Windows paths completely unchanged.
- Checking `fs.existsSync` before adding each directory prevents ghost PATH entries.
- Case-insensitive deduplication (`d.toLowerCase()`) avoids re-adding paths already present under different casing.
- esbuild bundled the change cleanly — no type errors, 50ms build.

## Surprises

- VS Code's extension host gets Windows registry PATH (system + user) but never sources shell profiles. `%APPDATA%\npm` is often absent because nvm-windows or older Node.js installers write only to the PowerShell profile, not the registry.
- The `compile` script does not exist; the correct script is `build`.

## Differently

- Could also read `npm config get prefix` to handle non-default npm prefix locations, but that requires spawning a process at extension activation — too slow for the common case.

## Follow-ups

- If users report CLIs still not found, add logging to `buildServerEnv()` so the output channel shows which directories were added.
