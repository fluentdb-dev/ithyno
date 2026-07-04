## 1. Docs: revert flow section

- [ ] 1.1 `.claude/skills/openspec-flow/SKILL.md`: new "## Revert" section covering naming convention, Case α / Case β classification, reverted-target archive steps, ordering (targets before revert)
- [ ] 1.2 `templates/.claude/skills/openspec-flow/SKILL.md`: mirror

## 2. Docs: CLAUDE.md cross-reference

- [ ] 2.1 Root `CLAUDE.md`: add a one-line cross-reference in the Standard order block: "For reverting a past change, see the Revert section in `.claude/skills/openspec-flow/SKILL.md`."
- [ ] 2.2 `templates/CLAUDE.md`: mirror

## 3. Apply the workflow to three still-in-flight reverted targets

For each of `add-agent-pty-runner`, `add-agent-xterm-output`,
`add-agent-stdin-relay`:

- [ ] 3.1 Delete `openspec/changes/<id>/specs/` (target ADDED deltas collide with revert's new baseline in `openspec/specs/agent-runner/spec.md`)
- [ ] 3.2 Write `openspec/changes/<id>/outcome.md` per the Case β template — retain ✅ Worked / ⚠️ Surprises from the actual implementation, replace 🔁 Differently / 🌱 Follow-ups with a single bold pointer to `revert-agent-pty-layers`
- [ ] 3.3 Run `openspec archive <id> --yes` and let the file move into `openspec/changes/archive/`
- [ ] 3.4 Commit each archive with subject `archive: <id> (reverted)`
- [ ] 3.5 Ordering: complete all three reverted-target archives BEFORE archiving THIS change (`add-revert-workflow`) so the workflow's own archive commit lands last

## 4. Spec delta

- [ ] 4.1 `openspec/changes/add-revert-workflow/specs/dashboard/spec.md`: new "Revert Workflow" requirement documenting the naming convention, the two disposition cases, and the reverted-target archive steps

## 5. Verification

- [ ] 5.1 `openspec validate --all` passes after all three reverted-target archives
- [ ] 5.2 `openspec/specs/agent-runner/spec.md` unchanged by the three reverted-target archives (specs/ was deleted from each, so archive is a no-op on specs)
- [ ] 5.3 Grep for stale references to the three reverted targets in active changes and skills — should point at their archive path, not the active dir
- [ ] 5.4 A future revert (real or hypothetical) can be walked through by reading only the new Revert section of `openspec-flow/SKILL.md` — peer-review check
