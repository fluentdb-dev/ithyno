# Outcome: scope-tmux-session-name-per-project

## ✅ Worked

- New `tmuxSessionName(projectRoot?)` helper in `server/sync/pty.ts`:
  returns `ithyno-<12-hex-of-sha256(projectRoot)>` for a real root,
  literal `"ithyno"` when the root is missing (test-friendly).
- The tmux-wrap line in `ptyStartup` now consults
  `process.env.ITHYNO_TMUX_SESSION || tmuxSessionName(projectRoot)`
  — env var still overrides for opt-in cross-project sharing.
- `terminateAllLivePtys(oldProjectRoot?)` extended to also invoke
  `tmux kill-session -t <sessionName>` for the outgoing project so
  the pane doesn't linger.
- `POST /api/project/switch` handler captures `oldRoot = getProjectRoot()`
  **before** calling `setProjectRoot(next)`, then passes it to the
  terminate helper — the kill targets the correct (outgoing) session.
- 4 new unit tests in `server/sync/pty.test.ts` cover the derivation
  contract (undefined/empty fallback, per-project distinctness,
  determinism).
- All gates green: openspec validate --strict / npm test (49 files /
  645 tests) / typecheck / build.

## ⚠️ Surprises

- Stale `server/**/*.js` compiled files (untracked, from an old `tsc`
  run) were shadowing the `.ts` sources in vitest. Deleting the
  affected `server/sync/pty.js` + `pty.test.js` restored the correct
  import path. There are more stale `.js` files across `server/` —
  they didn't bite THIS test suite, but a broader cleanup is a
  latent follow-up.

## 🔁 Differently

- Rejected extracting the session-name logic into a separate module.
  The whole change is ~30 lines in one file (`server/sync/pty.ts`);
  keeping it local removes an unnecessary module boundary.
- Chose SHA-256 first 12 hex chars for the hash. 48-bit collision
  space, short enough to be cosmetically fine in `tmux ls` output,
  cryptographically overkill for the purpose (name uniqueness).
- The `tmux kill-session` on switch is best-effort with a 3-second
  timeout and swallowed errors. A stricter contract (fail the switch
  when kill fails) would deadlock if tmux got stuck; best-effort
  matches the "session may already be gone" reality.

## 🌱 Follow-ups

- **User migration for existing global "ithyno" session**: anyone
  upgrading from before this change may have a running tmux session
  literally named `ithyno`. Suggest one-line note in release notes:
  `tmux kill-session -t ithyno` to clean up. Not automated.
- **Broader `server/**/*.js` cleanup**: the stale compiled files
  polluting the source tree should be removed and `.gitignore`
  updated to prevent recurrence. Separate small change.
- **Session naming for env-override users**: when
  `ITHYNO_TMUX_SESSION` is set, per-project scoping is disabled
  (literal value wins). Currently intentional (backward compat), but
  a warning log or a `--session-prefix` variant could serve
  power-users who want both per-project + a custom prefix.
