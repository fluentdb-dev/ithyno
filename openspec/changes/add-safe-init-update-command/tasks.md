## 1. Shared managed-file inventory

- [ ] Extract the platform-aware managed-file descriptors used by init.
- [ ] Define manifest location and hash format for installed template content.
- [ ] Exclude all CLI hook configuration from the managed inventory.

## 2. Safe update command

- [ ] Add `ithyno update [directory]` CLI parsing and `--dry-run` support.
- [ ] Implement create/update/skip/conflict reporting and atomic manifest writes.
- [ ] Preserve init's create-only behavior while reusing the shared inventory.

## 3. Tests and documentation

- [ ] Test missing, unchanged, modified, and idempotent managed files.
- [ ] Test notification script updates without hook changes.
- [ ] Document update behavior and conflict handling.
- [ ] Run typecheck, unit tests, and build.
