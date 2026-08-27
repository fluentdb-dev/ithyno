## 1. Implementation

- [x] 1.1 In `server-spawner.ts`, add `buildServerEnv()` helper that augments PATH on Windows with `%APPDATA%\npm` and `%USERPROFILE%\.local\bin` (only if each directory exists and is not already in PATH)
- [x] 1.2 Replace `{ ...process.env }` in `spawnServer` with the helper's result
- [x] 1.3 Rebuild `out/extension.js` and repackage VSIX
