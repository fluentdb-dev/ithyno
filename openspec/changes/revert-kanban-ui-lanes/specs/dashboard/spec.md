# Delta: dashboard — remove kanban phase-derived UI

## REMOVED Requirements

### Requirement: Kanban Phase Swim Lanes

**Reason**: violates the "看板 = TODO / IN-PROGRESS / DONE" principle.
Phase state is a Manager-internal concern; the Kanban must not
render it as visual lanes.

**Migration**: no user migration required. `POST /api/changes/:id/phase`
and the sidecar's `phase:` field remain — Manager and workers keep
reading / writing them. The Kanban now consults task progress for
column placement, ignoring phase entirely.

### Requirement: Legacy Fallback For Unphased Changes

**Reason**: the concept of a fallback section only exists because the
Kanban splits phased vs unphased cards. With phase lanes removed, all
cards use the same progress-derived bucketing — the fallback section
disappears.

**Migration**: no user migration. Cards that used to appear in the
"Unphased" section now appear directly in the progress-derived TODO /
IN-PROGRESS / DONE columns.

### Requirement: Progress-Independent Phase Placement

**Reason**: this requirement was the whole raison d'être of
`add-kanban-phase-lanes`. With phase lanes gone, placement follows
task progress again as it did before Phase 2.

**Migration**: no user migration. Cards return to being placed by
`bucketize`-style done / total math.
