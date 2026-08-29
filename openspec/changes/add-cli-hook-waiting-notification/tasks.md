## 1. Notification scripts (templates)

- [x] 1.1 Add `templates/scripts/notify-waiting.sh` supporting macOS (osascript) and Linux (notify-send) with graceful fallback when neither is available. Accept optional first argument as CLI name to display in the notification body.
- [x] 1.2 Add `templates/scripts/notify-waiting.ps1` supporting Windows: try `New-BurntToastNotification`, fall back to `[System.Windows.Forms.NotifyIcon]` so at least an audible/visual signal fires when BurntToast is not installed. Accept optional first argument as CLI name.
- [x] 1.3 Add smoke tests (shell) for `notify-waiting.sh` verifying: exit 0 with osascript stubbed, exit 0 with notify-send stubbed, no network calls (grep for curl/wget/nc absence).

## 2. Host OS detection and script scaffold

- [x] 2.1 Extend `bin/init.js` with a `platformNotifyScript()` helper that returns `{ src, destRel }` chosen from `process.platform` (`darwin`/`linux` → sh, `win32` → ps1). Unknown → return null and log a single-line warning ("notification hook: unsupported platform, skipping").
- [x] 2.2 Add `scaffoldNotifyScript(projectRoot, force)` that copies the selected script into `.ithyno/scripts/notify-waiting.{sh,ps1}`, sets mode `0755` on POSIX, and is idempotent (skip if present unless `--force`).
- [x] 2.3 Unit tests for `platformNotifyScript` covering each platform value and unknown values.
- [x] 2.4 Integration test for `scaffoldNotifyScript` — create a temp dir, run twice (once fresh, once idempotent), verify file exists with executable bit on POSIX.

## 3. Claude Code hook installer

- [x] 3.1 Add `installClaudeNotifyHook(projectRoot, scriptAbsPath, force)` in `bin/init.js` (or a new `bin/init-notify-hooks.js` module) that:
  - Reads `.claude/settings.json` if present, else initializes an empty object.
  - Uses a JSONC-tolerant parse so existing user comments are preserved on round-trip (introduce `jsonc-parser` if not already a dep; otherwise document that comments are stripped and issue a one-time warning).
  - Ensures an entry with `matcher: ""` and `hooks: [{ type: "command", command: scriptAbsPath }]` exists under both `hooks.Notification` and `hooks.Stop`.
  - Preserves any other user entries in those arrays.
  - Is idempotent (matches ithyno entry by exact script path — no duplicate on re-run).
  - Under `--force`, replaces the ithyno entry with a freshly-computed one.
- [x] 3.2 Unit tests for `installClaudeNotifyHook` covering: empty file, existing user entry (preserved), existing ithyno entry (no duplicate), `--force` overwrite, JSONC comments (preserved OR warning issued — one of the two).

## 4. agy hook installer

- [x] 4.1 Research agy's hook mechanism: which config file, which event names correspond to "response completed" and "awaiting input". Document findings inline in `bin/init.js` (or a `.agents/HOOKS.md` reference).
- [x] 4.2 If agy exposes equivalent events → add `installAgyNotifyHook(projectRoot, scriptAbsPath, force)` following the same idempotent-merge contract as the Claude installer. If agy does not expose them → skip installer, log a single-line warning ("notification hook: agy not yet supported"), leave rest of init working, and file a follow-up idea in `docs/ideas/`.
- [x] 4.3 Unit tests for `installAgyNotifyHook` (skip this task if 4.2 concludes agy is out of scope for this change).

## 5. Init orchestration wiring

- [x] 5.1 In `bin/init.js` `runInit`, after the existing scaffold loop, invoke: `scaffoldNotifyScript` → then for each `MANAGER_VERIFIED` CLI detected in the target project, invoke that CLI's hook installer with the absolute script path.
- [x] 5.2 Detection rule: for Claude, detect by presence of `.claude/` directory OR planned creation of one during init. For agy, detect by presence of `.agents/` directory OR planned creation. Match `MANAGER_VERIFIED = ["claude", "agy"]` from `web/src/components/InitDialog.tsx` so the two lists stay in sync.
- [x] 5.3 Ensure init exits with the same success semantics when notification-hook installation partially fails (e.g., write-permission error on the settings file) — surface a single-line warning per failed installer, don't fail the whole init.
- [x] 5.4 Integration test: run `openspec-ui init` on a temp project with `.claude/settings.json` containing a user hook. Verify post-state: notify script exists, user hook preserved, ithyno hook added, re-run is a no-op.

## 6. Documentation

- [x] 6.1 Update `README.md` (or `docs/`) with a short section: "CLI response-waiting notifications" — how to disable (delete/rename `.ithyno/scripts/notify-waiting.*`), how to re-enable (re-run init), which CLIs are covered.
- [x] 6.2 Update `CLAUDE.md` if the new hook affects any workflow guidance for Claude sessions.
- [x] 6.3 Add `outcome.md` template with the four sections (✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups) capturing what was learned during implementation. Fill in during archive.

## 7. Verification

- [x] 7.1 `npm test` passes (existing + new unit + integration tests).
- [x] 7.2 `npm run typecheck` passes.
- [x] 7.3 `npm run build` passes.
- [x] 7.4 Manual smoke: run init on a scratch project, start Claude Code, verify OS notification fires when Claude finishes a response and when it sits idle for 60s (Notification hook trigger).
