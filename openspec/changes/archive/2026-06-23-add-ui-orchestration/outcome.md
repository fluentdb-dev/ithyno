## ✅ What worked
- **Localhost-only PTY socket** combined with the same gate on `POST /api/pty/inject` made the security story trivially correct. No new auth surface required.
- **Single-line preview before send** turned the modal from "type and pray" into "see what you're sending." The Apply / Archive confirm dialogs read as obvious.
- **Server stays mode-agnostic**: the inject endpoint just writes bytes. Putting the `/opsx:*` shape decisions entirely in the UI was the right line.

## ⚠️ What surprised us
- The "most recently active terminal" registry is just an ordered array with `bump()` on input. Far simpler than a session map; covered the multi-tab edge case without ceremony.
- `term.write(data + "\r")` was the right newline. `\n` produced visible artifacts in some shells.

## 🔁 What we'd do differently
- The toast feedback ("Sent to terminal") is informative but unnecessary when the terminal echoes the command right there. Consider dropping it in a follow-up.

## 🌱 Follow-ups
- Added `add-cli-command-mode` to give users a choice between `/opsx:*` and `npx openspec` — surfaced from the "what if there's just a shell open?" question that came up during verify.
- Eventually: a global Show-Terminal toggle in the topbar so users can summon the terminal from Overview without first navigating to a change.
