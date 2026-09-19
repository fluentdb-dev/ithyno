## Why

The current development-environment manager parses `.env*` files without using
dotenvx's decryption resolver and treats a single host-stored value as the
primary encryption-key workflow. That diverges from dotenvx's standard
`.env.keys` and profile-specific `DOTENV_PRIVATE_KEY_*` model, prevents the
normal first-encryption flow, and makes encrypted profiles unreliable at
runtime.

## What Changes

- Make dotenvx's standard project-local `.env.keys` workflow the default for
  local development, while keeping `.env.keys` out of Git and out of dashboard
  responses.
- Resolve encrypted profiles through dotenvx itself so Manager PTYs and workers
  receive decrypted project values without receiving private-key variables.
- Allow first-time encryption to generate or update `.env.keys` without asking
  the user to preconfigure a key.
- Detect profile-specific private keys such as `DOTENV_PRIVATE_KEY` and
  `DOTENV_PRIVATE_KEY_DEVELOPMENT` instead of modelling encryption as one
  generic key.
- Treat dotenvx Native storage and host storage integrations as optional
  hardening paths layered on the standard workflow, not replacements for it.
- Replace the generic key-entry-first UI with source/status guidance and
  explicit migration or import actions appropriate to the active host.
- Add explicit, confirmed deletion of project-root env profiles without
  silently deleting their corresponding private keys.
- Retire the incompatible implementation approach described by
  `secure-extension-dotenvx-keys` and `secure-electron-dotenvx-keys`; any host
  integration retained from those proposals must follow the standard dotenvx
  key names and resolution semantics.

## Capabilities

### New Capabilities

- `dotenvx-development-environment`: Standard-compatible discovery,
  encryption, decryption, key-source reporting, optional secure-storage
  integration, process isolation, and profile deletion for development env
  profiles.

### Modified Capabilities

<!-- No archived baseline capability currently defines this behavior. -->

## Impact

- Reworks `server/environment` resolution, encryption, diagnostics, and tests.
- Updates Manager PTY and AgentRunner environment composition boundaries.
- Renames the user-facing Environment workspace to Secrets and revises its
  Electron/VS Code key-management bridges while preserving internal environment
  routes and API identifiers.
- Adds end-to-end fixtures covering `.env.keys`, profile-specific keys,
  optional native storage, and first-time encryption.
- Supersedes the unimplemented secure-key proposals named above; the existing
  profile editor and non-key environment-management behavior remain in scope.
