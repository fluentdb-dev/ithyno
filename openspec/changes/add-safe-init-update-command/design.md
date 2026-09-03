## Context

Init currently copies templates with create/skip semantics. A separate update
operation must avoid overwriting project files that users have edited, while
still allowing generated files such as the host-specific notification script
to receive fixes. Both commands must use the same inventory.

## Goals / Non-Goals

**Goals:**
- Introduce a clearly separate update command.
- Detect whether a file is still owned and unmodified by ithyno.
- Share inventory and ownership logic with init.
- Keep hook configuration untouched by both commands.

**Non-Goals:**
- No forced overwrite as the normal update path.
- No automatic CLI hook enablement.
- No server-side update API.

## Decisions

- Maintain a shared managed-file descriptor used by both commands, including
  source template, destination, host/platform filtering, and ownership marker.
- Record a compact manifest of installed template hashes in the project
  metadata. Update replaces a file only when its current hash matches the
  recorded managed hash; otherwise it reports a conflict and leaves it intact.
- Keep `init` create-only. `update` is the only command that applies newer
  template content, and it supports a read-only dry-run report.
- Notification scripts are managed files, but `.claude`, `.agent`, `.codex`,
  and `.github` hook configuration remains outside the inventory.

## Risks / Trade-offs

- [Manifest missing in older projects] → treat existing files as user-owned and
  skip them; update can safely create only missing files.
- [Template changed outside the manifest] → report a conflict instead of
  guessing or overwriting.
- [Manifest write failure] → complete file updates only when the manifest can
  be written atomically, otherwise fail with an actionable error.
