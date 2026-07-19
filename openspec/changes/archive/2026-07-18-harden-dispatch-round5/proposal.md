---
tags: [feature/agents, area/skills, agmsg, dispatch, portability]
---

# Harden dispatch from Round 5 (non-agmsg) findings

## Why

Round 5 (`verify-dispatch-e2e-5`) exercised the non-agmsg dispatch
path (Task tool + subprocess branches) as a regression check on
the `harden-dispatch-from-round3` fixes. Two workflow contract
gaps surfaced.

### 1. `AGMSG_TEAM` extraction uses GNU-only sed

The current skill extracts the team name with:

```bash
AGMSG_TEAM=$(sed -n '/^agmsg:/,/^[^ ]/{s/^  team:[[:space:]]*//p}' agents.yaml | head -1)
```

BSD `sed` (macOS default) rejects the `{...}` block in `-n`
address form with `bad flag in substitute command: '}'`, leaving
`$AGMSG_TEAM` silently empty. Consequences:

- The Manager registration guard (`if [ -n "$AGMSG_TEAM" ] …
  join.sh …`) is a no-op — the guard we landed in
  `harden-dispatch-from-round3` does not fire on macOS.
- The agmsg branch's report contract embeds an empty team name in
  the boot-prompt's `send.sh` line, so workers can't route their
  report messages back.

Silent breakage in a spec-critical path.

### 2. Subprocess branch has no artifact contract

The agmsg branch was hardened in `write-review-md-to-explicit-path`
to name an absolute `review.md` path in the worker's boot-prompt
(the artifact contract). The **subprocess branch** for `review` /
`verify` — the fallback path used by Copilot, Antigravity, and any
non-Task-tool CLI — was not updated. It still relies on the
worker's cwd inference to place `review.md` in the change dir.

Round 5 confirmed the failure mode: Copilot (subprocess branch,
run from `.worktrees/verify-dispatch-e2e-5/`) writes `review.md`
to the **main tree**, not the worktree. That worked in Round 5
only because the disposable branch also existed in the main tree
(same file system path); a real dispatch on a landed change
would have Manager reading from a worktree path that never gets
written.

The other half of the same bug: Manager's post-report artifact
read for Task tool / subprocess branches uses a relative
`openspec/changes/<change-id>/review.md` path, which resolves
against Manager's cwd (project root, main tree) — not the
worktree. Even a well-behaved reviewer that respects cwd would
write to the worktree, and Manager would fail to find it.

## What Changes

### 1. Portable AGMSG_TEAM extraction

Replace the GNU-only sed with a POSIX-portable extraction. The
recommended form (awk) makes the "look inside the `agmsg:` block
for a `team:` field" logic explicit:

```bash
AGMSG_TEAM=$(awk '
  /^agmsg:/ { in_block=1; next }
  in_block && /^[^ ]/ { in_block=0 }
  in_block && /^  team:/ { sub(/^  team:[[:space:]]*/, ""); print; exit }
' agents.yaml)
```

The spec SHALL mandate portable extraction (no GNU-only sed
syntax) and require the skill to be validated on BSD sed
platforms (macOS default, FreeBSD).

### 2. Subprocess branch artifact contract

The subprocess branch of the Dispatch helper protocol SHALL
append the same absolute-path artifact contract to its `-p`
prompt that the agmsg branch already appends. Same wording, same
`<TARGET_PATH>` semantics.

```bash
cd .worktrees/<change-id>   # only when worktree mode
<entry.command> <entry.args...> -p "<resolved-prompt>$ARTIFACT_CONTRACT"
```

Where `$ARTIFACT_CONTRACT` is empty for code stage, and for
review/verify carries the identical boilerplate to the agmsg
branch (naming `$REVIEW_MD_PATH`).

The Task tool branch inherits Manager's cwd (project root, main
tree) — for it, the artifact contract is still appended but
resolves to the main-tree path in worktree mode. That still gives
the reviewer an unambiguous absolute path to write to, matching
where Manager reads from (see below).

### 3. Manager reads review.md from `$REVIEW_MD_PATH`

The LOOP review stage (step 7) and Verify stage (step 8) of the
skill's Steps section currently read
`openspec/changes/<change-id>/review.md` (relative). Change to
`$REVIEW_MD_PATH` (absolute, computed in step 4), matching what
the artifact contract instructed the worker to write.

This aligns Manager's read path with the worker's write path
across all three branches:

| Branch | Worker cwd | Where worker writes | Manager reads |
| --- | --- | --- | --- |
| agmsg | worktree | `$REVIEW_MD_PATH` (worktree) | `$REVIEW_MD_PATH` |
| subprocess | worktree | `$REVIEW_MD_PATH` (worktree, per contract) | `$REVIEW_MD_PATH` |
| Task tool | main tree | `$REVIEW_MD_PATH` (main tree, per contract) | `$REVIEW_MD_PATH` |

### 4. What this change does NOT touch

- **agmsg branch's `AGMSG_TEAM` extraction inside the branch body**
  — same fix applies (the branch body has a second instance of
  the same broken sed at spawn time). This change fixes both.
- **agents.yaml schema** — no change.
- **Failure recovery ladder** — untouched.

## Spec deltas (`dashboard` capability)

- **MODIFIED** `Dispatch Slash Command` —
  - Mandate portable `AGMSG_TEAM` extraction (no GNU-only sed).
  - Add the artifact contract to the subprocess branch.
  - Manager reads review.md from `$REVIEW_MD_PATH` (absolute) in
    all three branches, not the relative form.

## Impact

- **Affected specs**: `dashboard` — 1 MODIFIED
- **Affected code**: `.claude/commands/ithy-opsx/dispatch.md`
  - Replace both AGMSG_TEAM sed extractions with awk
  - Extend the subprocess branch block to inject the artifact
    contract
  - Change LOOP review / verify stage read from relative path to
    `$REVIEW_MD_PATH`
- **Risk**:
  - No behavior change for previously-working paths — the awk
    fix restores the GNU-only path to work on BSD, and the
    subprocess artifact contract only tightens what workers do
    (no path is broken by having a MORE-specific instruction).
  - Copilot's cwd-ignore behavior — this change makes the
    subprocess branch NOT rely on that quirk. If a future
    Copilot version starts respecting cwd, the dispatch flow
    still works because the artifact contract names an
    absolute path.
- **Migration**: none.

## Related

- `verify-dispatch-e2e-5` (Round 5 non-agmsg smoke test — bugs
  discovered here).
- `write-review-md-to-explicit-path` (introduced the artifact
  contract for the agmsg branch — this change extends it to
  the subprocess branch).
- `harden-dispatch-from-round3` (Round 3 fixes — same session).
