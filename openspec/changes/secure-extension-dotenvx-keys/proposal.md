## Why

The VS Code extension currently recognizes dotenvx encryption keys only when
they are inherited through the VS Code process environment. This provides no
extension-native secure setup path and risks propagating encryption credentials
to Manager PTYs and AgentRunner workers that do not need them.

## What Changes

- Add workspace-scoped dotenvx key storage backed by the VS Code Extension
  `SecretStorage` API rather than settings, project files, or logs.
- Add extension/dashboard actions to set, replace, inspect the presence of, and
  remove the stored key without returning its plaintext value to the UI.
- Deliver the key to the development-environment encryption operation only when
  required, over an authenticated and bounded extension/server channel.
- Keep extension-managed encryption keys out of the ithyno server's general
  inherited environment and explicitly exclude them from Manager PTY and
  AgentRunner worker environments.
- Clear in-memory key material when the project changes, the server session is
  replaced, or the extension is deactivated.
- Preserve environment-variable key discovery as a documented compatibility
  path while reporting that it is broader in scope than extension-managed
  storage.

## Capabilities

### New Capabilities

- `extension-encryption-key-storage`: Workspace-scoped secure storage,
  authenticated use, lifecycle handling, and subprocess isolation for dotenvx
  encryption keys in the VS Code extension.

### Modified Capabilities

- `vscode-extension`: Expose secure dotenvx key management through the
  extension and communicate only key presence to the dashboard.

## Impact

- Affects the VS Code extension host, server-spawn/session protocol,
  development-environment API and UI, dotenvx adapter invocation, Manager PTY
  environment construction, and AgentRunner environment construction.
- Depends functionally on `add-code-development-env-manager`; it does not move
  project environment values out of their dotenvx-compatible `.env*` files.
- Adds no plaintext key to `settings.json`, `agents.yaml`, `.ithyno` state,
  logs, WebSocket events, or API responses.
