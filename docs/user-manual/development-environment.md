# Secrets

The **Secrets** workspace manages code-development variables stored in the
project's dotenv-compatible `.env*` files. These values are separate from
ithyno's own session variables and agent configuration.

## Profiles and source files

ithyno discovers supported `.env*` files inside the project root. Select a
profile before starting a new Manager or dispatching a worker. The selected
profile remains the source of truth; ithyno stores only the selection metadata
in `.ithyno/environment.json`, not copies of its values.

The default local key source is the project-root `.env.keys` file used by the
bundled dotenvx 2.23.0 runtime. A selected profile can decrypt from
`DOTENV_PRIVATE_KEY` or a matching profile-specific key such as
`DOTENV_PRIVATE_KEY_DEVELOPMENT`. Plaintext `.env` and `.env.<profile>` files
remain the value source, while `.env.keys` remains the secret holder for
encrypted files.

Existing Manager terminals and running workers are not modified when the
selection or a value changes. Restart the Manager from the terminal refresh
control and launch new workers to apply the updated environment.

## Values, encryption, and deletion

Values are masked by default. Use the eye control to reveal or hide one value,
and the copy control to copy it without changing the visible state. Edit and
delete operations are staged first and show a review dialog before the profile
file is saved.

When a profile is encrypted for the first time, ithyno asks for confirmation
before invoking bundled dotenvx with the exact profile path and project-root
`.env.keys` path. It then appends the exact `.env.keys` entry to `.gitignore`
without rewriting unrelated ignore rules. The profile delete flow removes only
the selected `.env*` project file and does not delete `.env.keys` or any native
secret-store key material.

Unsaved changes remain available while navigating the dashboard. A stale-write
warning means the env file changed outside ithyno after it was loaded; reload
the profile and review the changes again instead of overwriting the newer file.

## Security and Git diagnostics

- Keys beginning with `ITHYNO_` are reserved and cannot be managed as project
  values. Dashboard session values always remain authoritative.
- `.env.keys` is the standard local secret file; keep it out of Git and never
  commit the real key material.
- Warnings about tracked secret-bearing `.env*` files are informational. ithyno
  does not change Git state automatically, except the explicit append-only
  `.env.keys` ignore rule used during a confirmed first encryption.
- dotenvx encryption uses the configured key source. Routine lists,
  diagnostics, errors, and WebSocket events do not include plaintext values.
- Legacy `DOTENVX_KEY` / `DOTENV_KEY` inputs are accepted only as compatibility
  inputs while the default workflow stays `DOTENV_PRIVATE_KEY` and
  `DOTENV_PRIVATE_KEY_<PROFILE>` semantics.
- Optional OS secure key storage is available when the host supports dotenvx
  Native. **Move key to OS storage** removes the profile key from `.env.keys`
  after storing it in the OS. **Copy key to OS storage** keeps `.env.keys` and
  stores an additional OS copy. If OS storage is unavailable, `.env.keys`
  remains the supported workflow.
- CI and automation should inject secret material via environment variables or
  the platform secret store, not by committing real keys or storing them in the
  project tree.
- Child Manager PTYs and AgentRunner workers receive only resolved application
  values. `DOTENV_PRIVATE_KEY*` family members, `.env.keys` contents, and legacy
  credential env vars are stripped before launch.

## Practical guidance

- Keep real environment files out of version control. Commit example files
  containing placeholders only.
- Prefer profile-specific private keys (`DOTENV_PRIVATE_KEY_DEVELOPMENT`) when
  multiple profiles are in use.
- If a profile is deleted, the key remains in `.env.keys` or the active native
  secret store unless you explicitly remove it outside ithyno. This keeps the
  project file deletion separate from key lifecycle management.
