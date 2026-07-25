---
verdict: pass
summary: "Diff fully realizes proposal; drift-guard test covers the invariant; every install-machinery ref removed cleanly. Two low findings addressed in follow-up polish."
findings: []
---

## Findings addressed in follow-up polish

Round 1 verdict was `pass` with two low-severity notes on documentation
completeness. Both were closed before archive:

- `bin/init.js` — added a note in the header comment naming
  `openspec-flow` and `ithy-opsx-*` as the notable scaffold targets so a
  future reader sees why `templates/.claude/…` carries those trees.
- `openspec/changes/unify-ithyno-slash-command-surface/outcome.md` —
  Follow-ups 4, 6, 7 struck (with `~~text~~`) and each annotated as
  `**void** per distribute-ithy-opsx-via-init-templates` with the
  specific reason (subcommands gone, no auto-install, no Doctor row).

## Notes

### Diff realizes proposal

Cross-check of the six "What Changes" bullets vs. the diff:

| Proposal item | Impl status |
|---|---|
| Add templates/.claude/commands/ithy-opsx/ (11 files) | ✓ 11 files present at `templates/.claude/commands/ithy-opsx/`, all matching dev-copy names |
| Add templates/.claude/skills/ithy-opsx-*/ (6 dirs) | ✓ 6 skill dirs present; each with SKILL.md; matches dev-copy |
| Drift-guard test asserts byte-identity | ✓ `server/init.test.ts` `describe("ithy-opsx template drift guard")` — two `it()` blocks, one per surface (commands + skills). Named failure messages. |
| Remove user-global install machinery | ✓ `server/install-skills.ts` + test file deleted; startup wire in `server/index.ts` removed; both endpoints (`POST /api/doctor/install/ithy-opsx` + `.../uninstall/ithy-opsx`) removed |
| Remove `ithyOpsx` field from DoctorReport + mirror + fixtures | ✓ `server/doctor.ts` field + `checkIthyOpsxInstall()` import removed; `web/src/types.ts` `IthyOpsxDoctor` + field removed; two test fixtures pruned |
| Remove `IthyOpsxRow` + install/uninstall client helpers + CLI subcommands | ✓ `web/src/pages/Settings.tsx` `IthyOpsxRow` + render call + imports removed; `web/src/api.ts` two functions removed; `bin/ithyno.js` `install-skills` / `uninstall-skills` subcommands + helper removed; `bin/_install-skills-runner.ts` deleted |
| Remove `.claude/…` entries from package.json `files` + electron `extraResources` | ✓ Both trimmed; `templates/` continues to ship (already listed) |
| Amend unify's spec delta (remove 6 requirements) | ✓ `openspec/changes/unify-ithyno-slash-command-surface/specs/dashboard/spec.md` now has 4 requirements (Escalate, Answer, Revert, exclusive namespace) |
| Amend unify's tasks.md + outcome.md | Partially — SUPERSEDED banner added to both; individual sections/bullets not struck. Low finding above. |
| Dev-machine `~/.claude/` cleanup | ✓ Performed as part of §5 — `~/.claude/commands/ithy-opsx/`, 6 `~/.claude/skills/ithy-opsx-*/`, and `.ithyno-install-manifest.json` all removed |

### Post-impl dangling-ref sweep

`grep -rn 'install-skills\|installIthyOpsx\|uninstallIthyOpsx\|IthyOpsxDoctor\|ithyOpsx' server web bin electron/package.json package.json` returns **zero hits**. Every reference removed with the machinery.

### Spec compliance

Two ADDED requirements in `specs/dashboard/spec.md`:

1. **"Ithyno Init scaffolds `/ithy-opsx:*` into the target project"** — realized by the templates + the pre-existing generic walk in `bin/init.js:166`. All five scenarios are behaviourally satisfied:
   - Fresh target through Init: transitive from `runInit + writeAgentsYaml integration` test (uses `walkTemplates` which iterates every file under `templates/`, now including ithy-opsx).
   - Manager PTY resolution: Claude Code's job, not testable here.
   - Non-Init'd project: trivially satisfied (nothing user-global anymore).
   - Server startup does not touch `~/.claude/`: startup wire removed; no runtime negative test but the code path is gone.
   - `GET /api/doctor` has no `ithyOpsx`: enforced at compile time by the type change + field removal.

2. **"Drift-guard test keeps the dev copy and the template in sync"** — realized by the new `describe("ithy-opsx template drift guard")` block. All three scenarios pass:
   - Dev-copy edit without template update fails: `if (!devBuf.equals(tmplBuf)) throw ...` covers it.
   - Template edit without dev-copy update fails: same comparator, symmetric.
   - Byte-identical passes silently: verified in §6 verification (2 new tests green among 27 pre-existing in the file).

### Non-blocking observations (informational)

- The `walk()` helper in the drift guard silently skips symlinks (`else if (ent.isFile())`). Fine because no symlinks exist in ithy-opsx trees today; if that ever changes, symlink pairs would go unchecked. Not worth guarding preemptively.
- Hidden files like `.DS_Store` are not filtered; if a dev accidentally commits one on only one side, the test will fail with a "template missing" or "drift" message correctly pointing at it. Feature, not bug.
- The unify-side spec delta now shows 4 requirements. `openspec validate unify-ithyno-slash-command-surface --strict` was re-run and passes.
- Merge commit `3814982` on develop, impl commit `351480b`. The `agent/distribute-ithy-opsx-via-init-templates` branch has been merged and cleaned up (worktree removed).

### Overall

The corrective character of the change (superseding an already-committed distribution decision) is well-handled: the four load-bearing wrapper/namespace requirements from `unify` are preserved untouched, only the six install-machinery requirements are removed, and the corrected direction is documented in both the new proposal.md and the annotations on unify's outcome.md/tasks.md.

Verdict: **pass**. The two low-severity findings are polish, not blockers.
