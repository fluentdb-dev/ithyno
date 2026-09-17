## ✅ Worked

- `ithyno init` scaffolds the host-specific notification script without
  enabling hooks; Settings → Prerequisites owns the per-CLI opt-in controls.
- Claude Code notification hook (`installClaudeNotifyHook`) working correctly via bash with `-File 'path'` format.
- Codex hook (`installCodexNotifyHook`) working as designed.
- Agy (Antigravity) hook moved to global `~/.gemini/config/hooks.json` with absolute paths — required because Antigravity's global config cannot resolve project-relative paths.
- PowerShell script `-HookType` parameter cleanly separates Stop (`{}`) vs PreToolUse (`{"decision":"allow"}`) JSON stdout contract.
- Both Stop and PreToolUse (ask_question matcher) hooks registered for Agy, covering all "waiting for input" scenarios.
- The macOS notification script and Agy `Stop` hook were manually verified in
  an initialized project.

## ⚠️ Surprises

- Antigravity runs hooks via `cmd.exe /c` on Windows, not bash. Single-quoted paths (`-File 'path'`) and `-Command "& ..."` both fail. Only bare `-File path` with named params works.
- Global config (`~/.gemini/config/`) cannot resolve project-relative paths — absolute paths required in `skills.json` and `hooks.json`.
- Agy Stop hooks must output valid JSON (`{}`) on stdout; any non-JSON output causes the hook call to be treated as an error by Antigravity's protojson unmarshaling.
- PreToolUse hooks require `{"decision":"allow"}` on stdout (not `{}`).
- Deduplication logic had a bug: removing stale entries and then conditionally skipping the push caused the hook to silently disappear on reinstall.
- Clickable macOS notifications require `alerter`; plain `osascript`
  notifications cannot reliably reactivate the originating application.
- Extension mode must retain the detected host application because a VS Code
  extension can run in compatible hosts such as Antigravity IDE.

## 🔁 Differently

- Would design the notification command builder with cmd.exe vs bash distinction from the start rather than iterating through `-File 'path'` → `-Command "& ..."` → `-File bare` with named params.
- Would audit Antigravity's hook execution chain (cmd.exe wrapping) before choosing quoting strategy.
- Keeping scripts under init management while making hook installation an
  explicit Settings action avoids surprising users with hooks enabled by
  default.

## 🌱 Follow-ups

- Verify Agy PreToolUse hook fires correctly in practice (ask_question matcher).
- Consider adding a UI indicator when the global `~/.gemini/config/hooks.json` was written (currently silent).
- `.sh` script `$4` positional arg for `hook_type` is fragile if `$3` (HostAppName) is empty — consider switching `.sh` to named flag parsing for parity with `.ps1`.
- Complete native Linux notification verification and keep upstream CLI hook
  schemas under regression coverage.
