# Tasks — harden-dispatch-round5

## 1. PENDING annotation

- [x] 1.1 Insert PENDING MODIFIED annotation to
  `openspec/specs/dashboard/spec.md` § Dispatch Slash Command

## 2. Spec delta

- [x] 2.1 Write full MODIFIED requirement to
  `openspec/changes/harden-dispatch-round5/specs/dashboard/spec.md`

## 3. Skill body

- [x] 3.1 Replace both AGMSG_TEAM sed extractions with awk in
  `.claude/commands/ithy-opsx/dispatch.md`
- [x] 3.2 Inject artifact contract into subprocess branch (review
  and verify stages)
- [x] 3.3 Change LOOP review / verify stage `cat
  openspec/changes/<id>/review.md` to `cat "$REVIEW_MD_PATH"`

## 4. Verify

- [x] 4.1 `openspec validate harden-dispatch-round5 --strict` VALID
- [x] 4.2 Portable extraction: `awk` snippet returns the team on
  macOS bash 3.2 without errors
- [x] 4.3 `npm test && npm run typecheck && npm run build` clean
  (skill edits only, no code type contract change)

## 5. Post-impl

- [x] 5.1 `outcome.md`
- [ ] 5.2 `/ithy-opsx:archive harden-dispatch-round5`
