## ✅ Worked

- `ithyno init` scaffolds the host-specific notification script without
  enabling any CLI hook by default.
- Settings → Prerequisites exposes a per-CLI bell control and installs or
  removes project-local hooks independently of `agents.yaml`.
- Claude, Codex, Agy/Antigravity, and Copilot hook formats are handled without
  replacing unrelated user hooks.
- The macOS notification script and the Agy `Stop` hook were manually verified
  in a project initialized by ithyno.
- Automated coverage, type checking, and the production build passed.

## ⚠️ Surprises

- Agy uses `.agent/hooks.json`, and its `Stop` event requires a flat handler
  array rather than the grouped matcher shape used by tool events.
- Clickable macOS notifications require `alerter`; plain `osascript`
  notifications cannot reliably return the user to the originating host.
- A VS Code extension can run in VS Code-compatible hosts such as Antigravity
  IDE, so notification activation must retain the detected host application
  instead of assuming VS Code.

## 🔁 Differently

- The original proposal installed hooks during init. The final design keeps
  hooks opt-in: init owns and updates the notification scripts, while Settings
  owns enabling and disabling each CLI hook.
- The implementation expanded beyond the first Claude/Agy scope to provide the
  same explicit hook management contract for Codex and Copilot. Copilot remains
  hidden where the product cannot currently select it as a Manager.
- Notification context, grouping, timeout, and click activation are passed by
  the installer so one script can support Electron, extension hosts, and direct
  CLI use.

## 🌱 Follow-ups

- Complete native Windows and Linux manual verification, including BurntToast
  and `NotifyIcon` fallback behavior.
- Revisit Copilot visibility when it can be configured as a Manager.
- Keep hook schemas under regression coverage as upstream CLIs evolve.
