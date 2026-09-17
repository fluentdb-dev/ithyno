# Development Environment

The **Environment** workspace manages code-development variables stored in the
project's dotenv-compatible `.env*` files. These values are separate from
ithyno's own session variables and agent configuration.

## Profiles and source files

ithyno discovers supported `.env*` files inside the project root. Select a
profile before starting a new Manager or dispatching a worker. The selected
profile remains the source of truth; ithyno stores only the selection metadata
in `.ithyno/environment.json`, not copies of its values.

Existing Manager terminals and running workers are not modified when the
selection or a value changes. Restart the Manager from the terminal refresh
control and launch new workers to apply the updated environment.

## Values and changes

Values are masked by default. Use the eye control to reveal or hide one value,
and the copy control to copy it without changing the visible state. Edit and
delete operations are staged first and show a review dialog before the profile
file is saved.

Unsaved changes remain available while navigating the dashboard. A stale-write
warning means the env file changed outside ithyno after it was loaded; reload
the profile and review the changes again instead of overwriting the newer file.

## Security and Git diagnostics

- Keys beginning with `ITHYNO_` are reserved and cannot be managed as project
  values. Dashboard session values always remain authoritative.
- Warnings about tracked secret-bearing `.env*` files are informational. ithyno
  does not change Git state automatically.
- dotenvx encryption uses the configured dotenvx key source. Routine lists,
  diagnostics, errors, and WebSocket events do not include plaintext values.
- Keep real environment files out of version control. Commit example files
  containing placeholders only.
