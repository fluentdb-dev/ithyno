## Why

`init` is intentionally conservative and should not overwrite an existing
project. There is currently no safe, explicit way to bring ithyno-managed
scaffold files (including the notification script) up to date. Init and update
also need one shared definition of the files they manage so the two commands
cannot drift.

## What Changes

- Add an explicit `ithyno update [directory]` command for non-destructive
  synchronization of ithyno-managed files.
- Share the template/file-selection and ownership rules between `init` and
  `update`.
- Update only files that are absent or still match the previously installed
  ithyno content; preserve user-modified files and report them as skipped.
- Keep CLI hook configuration outside `init` and `update`; hook enablement
  remains an explicit Settings action.
- Add dry-run/reporting and automated coverage for create, update, skip, and
  idempotent behavior.

## Capabilities

### New Capabilities
- `safe-scaffold-update`: Explicit, non-destructive updating of ithyno-managed project files.

### Modified Capabilities
- `project-init`: Share the managed file inventory and preserve init's create-only behavior.

## Impact

- `bin/init.js` and CLI command registration.
- New ownership/manifest metadata for scaffold files.
- Init and update integration tests and user documentation.
- No changes to agent execution, CLI hooks, or server APIs.
