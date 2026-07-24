# Outcome — unify-ithyno-slash-command-surface

Landed 2026-07-24. Consolidates ithyno's Claude Code slash-command surface exclusively under `/ithy-opsx:*` and makes it a proper distributable/installable skill pack, replacing the earlier split between ithyno's `/opsx:*` additions and its `/ithy-opsx:*` orchestration commands.

## ✅ Worked

- **Category-based dichotomy** was the right principle: `/opsx:*` = upstream openspec's public API (project-scoped, `openspec init`); `/ithy-opsx:*` = ithyno server's internal orchestration (user-global, version-locked to ithyno). Renaming answer/escalate/revert into `/ithy-opsx:*` made the split coherent.
- **Deleted shadow duplicates cleanly**: 5 files (`apply/archive/explore/propose/sync.md`) that ithyno-ui had snapshotted from upstream openspec are gone. Users get the authoritative upstream copies from their own `openspec init`; ithyno no longer risks silently shadowing user-installed upstream commands with stale copies.
- **`git mv`** preserved history on the 3 renames + 1 skill dir rename.
- **Installer is unchanged from the earlier discarded proposal design**: sha256-per-file manifest, copy-based cross-platform, version-tracked. Applied cleanly to the simpler unified enumeration (walk `commands/ithy-opsx/**` + `skills/ithy-opsx-*/**` — no allowlist/blocklist gymnastics because opsx/ is empty of ithyno content).
- **Real-world smoke test** against `/tmp/ithy-opsx-clean-home` installed 11 commands + 6 skill dirs correctly, including the renamed `ithy-opsx-revert`.
- **PENDING annotations added** to all 3 MODIFIED requirements in the current spec (Revert / Escalate / Answer Command Wrappers) per CLAUDE.md hard rule so any concurrent worker reading the spec sees the impending change.
- **Kanban worker in parallel** completed its own change without touching any file this change edited — no merge conflict risk.

## ⚠️ Surprises

- **Scope creep on spec migration**: the original tasks.md listed 3 refs to migrate (dispatch.md `/opsx:escalate`, docs, spec.md revert scenarios). Actually found the spec also contained requirements for Escalate + Answer Command Wrappers referencing `/opsx:*`. Had to add 2 more MODIFIED entries (+PENDING annotations) to keep the spec consistent post-archive.
- **Phantom spec entry `/opsx:code`** — a "Code Worker Slash Command" requirement in dashboard/spec.md that names `/opsx:code`, but no file exists in `.claude/commands/` and no code references it. Left alone; documented as separate cleanup (its body still references `/opsx:escalate` which now points at the retired name, but the requirement itself never shipped so the double-staleness is inert).
- **`ithyno-ui repo` `.claude/` is older than upstream openspec** — target project has `openspec-update-change` skill + `opsx/update.md` (via newer `openspec init`) that ithyno-ui lacks. Not scope of this change; ithyno-ui developer runs `openspec update` when they want.
- **npm `files` glob**: `.claude/skills/ithy-opsx-*` alone does NOT include directory contents. Have to use `.claude/skills/ithy-opsx-*/**`. Verified with `npm pack --dry-run`.

## 🔁 Do Differently

- **No backwards-compat alias for retired `/opsx:{answer,escalate,revert}`**. This is a clean rename; typing the old name yields "Unknown command". Acceptable because the current user base is ithyno's own developers (no external adopters). If we ever ship a formal 1.0 with real users, an aliases file could sit at `~/.claude/commands/opsx/*.md` bridging to the new names for one release cycle. Not this change.
- **Manual Windows validation deferred**. Design is cross-platform-safe by construction (`os.homedir()`, `path.join`, copy-not-symlink), but runtime verification needs a Windows box that isn't available in this session.
- **Docs sweep left partial**: the two migrated `/opsx:*` refs in `docs/2026-07-07-*` and `docs/2026-07-11-*` are done, but a broader docs re-read might surface more historical narratives that reference the old names in context. Deferred to a docs-focused pass.

## 🌱 Follow-ups

1. **Manager PTY restart** on the boilerplate project (or wherever Pattern B users have ithyno running) to pick up `~/.claude/commands/ithy-opsx/*.md`. Claude Code doesn't hot-reload commands. Document in release notes.
2. **Clean up phantom `/opsx:code` requirement** — either REMOVE the "Code Worker Slash Command" requirement from `dashboard/spec.md` (it never shipped) or actually create the file and formalize it. Separate revert-scope change.
3. **`openspec update` on the ithyno-ui repo** to pull in upstream openspec's newer `opsx/update.md` and `openspec-update-change` skill. Housekeeping.
4. **Windows CI job** running `install-skills`/`uninstall-skills` and asserting the `%USERPROFILE%\.claude\` layout. Add to release matrix.
5. **`scripts/verify-bundle.mjs`** — a scripted assertion that both npm pack and Electron packaging outputs contain the expected file set. Wire into `npm run release:build`.
6. **User manual entry** in `docs/user-manual-init-and-import.md` describing the auto-install: what gets installed, where, how to uninstall, how to hand-edit safely.
7. **Consider a Doctor row hint** on first launch after install: "Manager PTY may need a restart to pick up newly-installed commands" — the install runs after `fastify.listen`, but any Manager PTY already running (rare during first launch, common during upgrade) won't see the new commands.
