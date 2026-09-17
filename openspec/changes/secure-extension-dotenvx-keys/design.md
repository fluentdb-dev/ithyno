## Context

The development-environment manager detects dotenvx keys in the ithyno
server's inherited process environment. The VS Code extension starts that
server with a copy of the Extension Host environment, while Manager PTYs and
AgentRunner workers also inherit broad portions of the server environment.
Consequently, setting a key before launching VS Code is operationally possible
but neither extension-native nor narrowly scoped.

VS Code provides `ExtensionContext.secrets`, backed by the host platform's
credential storage. The dashboard itself runs inside a nested webview iframe
and must never receive stored plaintext merely to render key status.

## Goals / Non-Goals

**Goals:**

- Store a dotenvx encryption key per canonical workspace using VS Code
  `SecretStorage`.
- Let the user set, replace, and remove the key from the Environment UI while
  exposing only presence/source status to the webview.
- Make plaintext available only to the specific dotenvx operation that needs
  it and only for the lifetime of that operation.
- Prevent all known dotenvx key variables from reaching Manager PTYs and
  AgentRunner workers, including keys inherited as a compatibility fallback.
- Keep browser and Electron behavior compatible with the existing runtime
  environment path.

**Non-Goals:**

- Replacing dotenvx encryption or defining a new key format.
- Storing project environment values in VS Code SecretStorage.
- Synchronizing secrets between machines or users.
- Displaying or copying the stored encryption key after it has been saved.
- Adding equivalent OS credential-store integrations to Electron in this
  change.

## Decisions

### Use workspace-scoped VS Code SecretStorage

The Extension Host SHALL store the key under a versioned identifier derived
from the canonical workspace root. The UI collects a new value through a
password-style VS Code input and can query only whether a value exists.

This is preferred over `settings.json`, `.env.keys`, extension global state,
or a custom encrypted file because SecretStorage delegates encryption and
access control to the host platform and avoids introducing another master key.

### Proxy key-dependent operations through the Extension Host

For an extension-managed key, the dashboard sends an operation request to the
outer webview/Extension Host rather than asking the server to reveal a key. The
Extension Host retrieves the secret and submits it with the authenticated,
one-shot encryption request to the loopback server. The server does not cache
the key and returns only a secret-safe operation result.

The existing session token remains mandatory. Request bodies, headers, errors,
and telemetry SHALL redact the key. A direct browser request cannot read the
Extension Host secret.

This bounded request is preferred over placing the key in the server's startup
environment, where it would persist for the whole server session and be
available to unrelated child-process launch paths.

### Scope plaintext to the dotenvx subprocess

The environment adapter accepts an explicit optional key for an individual
operation. It constructs a dedicated child environment for dotenvx without
mutating `process.env`. References to the plaintext are released when the
operation completes.

### Deny key propagation at both child-process boundaries

A shared sanitizer removes `DOTENVX_KEY`, `DOTENV_KEY`,
`DOTENV_PRIVATE_KEY`, `DOTENV_PUBLIC_KEY`, `DOTENVX_KEYS`, and
`DOTENVX_KEY_FILE` from environments used to launch Manager PTYs and
AgentRunner workers. This defense also applies to keys inherited through the
compatibility path, not only SecretStorage values.

### Keep compatibility behavior explicit

Electron, browser launches, and existing extension users can continue to
provide supported dotenvx key variables in the ithyno server environment.
The Environment UI distinguishes `extension-secret`, `process-environment`,
and `missing` status without exposing values. Compatibility does not override
the subprocess sanitization rule.

## Risks / Trade-offs

- **[Risk] Loopback request briefly contains plaintext** → Require the current
  session token, accept the key only on the dedicated operation endpoint, omit
  request-body logging, and never persist or broadcast the request.
- **[Risk] Workspace paths change or resolve through symlinks** → Derive the
  storage identifier from the same canonical root used by the extension's
  project session and provide an explicit replace/remove flow.
- **[Risk] Sanitizing inherited keys could surprise workers that independently
  relied on them** → Treat encryption credentials as control-plane secrets;
  project runtime secrets must come from the selected development profile
  instead.
- **[Risk] Extension/server versions drift** → Version the message payload and
  return a clear unsupported response without deleting the stored secret.
- **[Trade-off] SecretStorage is not available to Electron** → Retain the
  existing environment-variable path there and address Electron credential
  storage separately.

## Migration Plan

1. Add the key sanitizer and verify Manager/worker isolation before exposing
   the SecretStorage UI.
2. Add the versioned Extension Host message and authenticated one-shot server
   operation.
3. Add set/replace/remove/status actions to the Environment UI for VS Code.
4. Preserve inherited-key detection as a compatibility source and document its
   broader scope.
5. Rollback removes the UI/proxy integration; stored SecretStorage entries can
   remain unread and can be deleted by a cleanup command without affecting env
   files.

## Open Questions

- Whether a later Electron change should use Electron `safeStorage` or a
  platform keychain abstraction.
- Whether users need an explicit "use process environment instead" override
  when an extension secret exists.
