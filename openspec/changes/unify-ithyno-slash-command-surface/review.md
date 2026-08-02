---
verdict: pass
summary: Namespace unification is clean; installer, HTTP endpoints, doctor extension, Settings UI, and CLI subcommands are correctly wired with adequate test coverage — only nits found.
---

## Findings

### LOW

- **`server/install-skills.ts:1` (`bin/_install-skills-runner.ts:1`)** — shebang `#!/usr/bin/env -S npx tsx` on `bin/_install-skills-runner.ts` is inert: the file is not marked executable (`-rw-r--r--`) and `bin/ithyno.js`'s `runSkillsSubcommand` invokes it via `spawn(process.execPath, [tsxCli, runner, ...])`, bypassing any shell shebang resolution. Non-bug (matches `_doctor-runner.ts` pattern) but the shebang is misleading — a reader would assume it's directly executable. Optional cleanup.

- **`server/install-skills.ts:305-326`** — fast-path (same-version + all-files-present + `!force`) short-circuits before scanning for user-modified files. If the user hand-edits a file BETWEEN version bumps, `Doctor.ithyOpsx.userModifiedFiles` will not surface the modification until the next version bump (which does the sha256 diff). Settings UI's ⚠ badge is therefore blind to same-version edits. Documented behavior per spec ("only re-copies when they differ") but the Settings display expects `userModifiedFiles` to be authoritative. Not a real bug (spec-conformant), just a subtle UX gap. Users who care can `[Reinstall]` to refresh.

- **`server/install-skills.ts:556-561`** — `checkIthyOpsxInstall`: when `bundledFiles` is empty (e.g. packaged app corrupt / bundle root exists but ithy-opsx tree is empty), `bundledFiles.every(...)` returns true → `installed: true` with `commandCount: 0, skillCount: 0`. Zero-count in the row is a visible tell but the boolean `installed` misrepresents. Fringe scenario; consider `installed: !!manifest && allPresent && bundledFiles.length > 0` for robustness.

- **`server/index.ts:1660-1684`** — install runs before `fastify.listen` with NO timeout wrapper. Failure paths (EACCES on unwritable `~/.claude`, ENOSPC, etc.) throw fast → caught → server continues. Bounded execution is realistic on all POSIX/Windows filesystems in normal conditions. A pathological hang (broken NFS/FUSE mount over `~/.claude`) would block server startup indefinitely, but that's exotic and out of scope for cross-platform tooling. Consider a `Promise.race` with a 10s bound as future hardening.

## Positive observations

- **Test coverage is real**: 12 tests exercise fresh-install / no-op / version-bump / user-modified-preserve / cleanup / uninstall / idempotent / preserve-unrelated / doctor-installed / doctor-not-installed against a synthetic bundle in tmp — all pass. The "non-ithy-opsx sibling MUST NOT be picked up" assertion (`seedBundle` seeds a decoy `openspec-flow` sibling) directly guards against the enumeration mistake the task worried about.

- **Cross-platform hygiene**: POSIX-form paths in manifest keys (`posixJoin` distinct from `path.join`), `os.homedir()` for user root resolution, `copyFile` (never symlink), atomic manifest write via tmp+rename. All the right patterns for Windows compatibility.

- **`resolveBundledSkillsRoot` walk-up terminates correctly**: `dirname("/") === "/"` on POSIX and `dirname("C:\\") === "C:\\"` on Windows are both caught by `if (parent === cursor) break;` — no infinite loop risk.

- **`tryRemoveEmptyDirs` scoping is safe**: candidates are explicitly `commands/ithy-opsx` and each `skills/ithy-opsx-*` directory. It recursively descends into these but never climbs above them — parents `commands/` and `skills/` are never `rmdir`'d.

- **HTTP endpoints correctly session-token gated**: both `POST /api/doctor/{install,uninstall}/ithy-opsx` use the same `extractToken` + `verifyToken` shape as other mutating routes. No localhost implicit trust.

- **PENDING annotations conform to CLAUDE.md hard rule**: all 3 MODIFIED requirements (Escalate line 973, Answer line 994, Revert line 3323) in `openspec/specs/dashboard/spec.md` have properly-formatted `> ⚠️ **PENDING MODIFIED** by [change-id](../../changes/change-id/): reason.` annotations directly beneath their `### Requirement:` headings.

- **Client/server type parity**: `IthyOpsxDoctor` in `web/src/types.ts:398-406` is byte-identical to the server's `IthyOpsxDoctor` in `server/install-skills.ts:71-79`. No `undefined`-at-runtime drift risk.

- **Missed-refs sweep is thorough**: post-edit grep shows zero live refs to `/opsx:{answer,escalate,revert}` or `opsx-revert` in server/web/bin. Remaining refs are all intentional: PENDING'd requirement bodies in current specs (rewritten at archive), historical citation in `ithy-opsx-revert/SKILL.md` documenting the rename lineage, and change-artifact docs (proposal/tasks/outcome). Note: dispatch.md still has `/opsx:apply` refs at lines 133/147 — these are intentional references to upstream openspec's `/opsx:apply` (owned by `openspec init`, not ithyno), which is the correct code-worker default.

- **Doctor race is benign**: `checkIthyOpsxInstall` in the parallel Promise.all is read-only (readManifest + existsSync + walkFiles). Concurrent installer writes are per-file atomic and manifest write is tmp+rename atomic — worst case is a stale snapshot that the WS `doctor-updated` broadcast resolves.

- **npm pack verified real-world**: 11 commands + 6 skill dirs, no leftover `opsx-revert`, no `commands/opsx/*`. Matches the spec's `Scenario: npm pack includes exactly the ithy-opsx tree` assertion exactly.
