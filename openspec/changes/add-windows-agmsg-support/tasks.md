## 1. Git Bash resolution helper

- [x] 1.1 Added `electron/src/resolve-git-bash.ts` — locates `git.exe` via `git --exec-path`, derives `<gitRoot>\bin\bash.exe`, verifies the file exists
- [x] 1.2 Returns `null` (not a throw) when git isn't found or the derived `bash.exe` doesn't exist
- [x] 1.3 No automated test (see rationale) — verified manually: compiled in isolation and confirmed it resolves to `C:\Program Files\Git\bin\bash.exe` on this machine (§6)

## 2. sqlite3 detection

- [x] 2.1 Added `hasSqlite3()` in `agmsg-installer.ts` (`where sqlite3`, same pattern as `commandExistsOnPath` in `server/sync/pty.ts`)

## 3. `ensureAgmsgInstalled()` Windows branch

- [x] 3.1 `electron/src/agmsg-installer.ts` — replaced the unconditional win32 skip with a Git Bash + sqlite3 gate; logs which dependency is missing and returns (no dialog) when either is absent
- [x] 3.2 Confirmed no separate Windows install path is needed — the existing `cpSync`/`chmodShellScripts` logic runs unmodified once the gate passes
- [x] 3.3 Verified Node's `os.homedir()` (`C:\Users\cshara`) and Git Bash's `$HOME` (`/c/Users/cshara`) resolve to the same location — no normalization needed

## 4. Messaging dispatch call sites (verified moot — no code change)

- [x] 4.1 Audited: `server/agents/spawn-options-writer.ts` only reads/writes `~/.agmsg/config/spawn_options.yaml` (plain fs, no shell-out). The actual `join.sh`/`send.sh`/`api.sh` invocations happen inside the live Manager agent's own Claude Code session (a real Claude Code CLI process, per `.claude/commands/ithy-opsx/dispatch.md`), using *its own* Bash tool — which on Windows already resolves Git Bash correctly (this session's own tool is proof). No ithyno server/Electron code shells out to agmsg's messaging scripts directly; nothing to change here.

## 5. Spec delta

- [x] 5.1 `openspec/changes/add-windows-agmsg-support/specs/dashboard/spec.md`: MODIFIED "Electron First-Launch Auto-Installs Agmsg" — Windows install-prompt parity, Git Bash resolution rule, sqlite3 gate
- [x] 5.2 PENDING MODIFIED annotation added to `openspec/specs/dashboard/spec.md` under the same requirement

## 6. Verification

- [x] 6.1 Windows, fresh `~/.agents/skills/agmsg/` absent (moved aside), Git Bash + sqlite3 present: `npm run electron:dev` → Install/Skip/Never ask dialog appeared (screenshotted); clicking Install produced `[agmsg-installer] installed vendored agmsg tree to C:\Users\cshara\.agents\skills\agmsg`, 341 files matching `vendor/agmsg` exactly, executable bits set
- [ ] 6.2 Windows, sqlite3 missing from PATH — not tested (would require temporarily hiding the only sqlite3 on this machine, which other tools may depend on); logic is a straightforward `where` check mirroring the already-proven `commandExistsOnPath` pattern
- [x] 6.3 Windows: `join.sh` → `send.sh` → `api.sh get teams <team> messages` round-trip verified against the app-installed copy (not just the earlier ad-hoc manual install) — full send/receive JSON confirmed
- [ ] 6.4 macOS/Linux: not tested this session (no access to those platforms) — the code path for those platforms is byte-for-byte unchanged, so no regression is expected, but this is unverified by hand
- [x] 6.5 `npm test && npm run typecheck && npm run build` — all pass

## 7. Follow-ups (not this change)

- [ ] 7.1 tmux `delivery.sh` monitor-mode integration on Windows — separate change once tested
- [ ] 7.2 Consider bundling a portable `sqlite3.exe` if PATH-detection failure proves common in practice
