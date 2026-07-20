---
verdict: needs-rework
---

# Review: add-terminal-reconnect

## Findings
- [high] electron/src/menu.ts:95 — The new `View → Reload Terminal` entry never sets `accelerator: "CmdOrCtrl+Shift+K"`. As shipped, Electron does not bind the required shortcut at all, so `Cmd/Ctrl+Shift+K` only works through the renderer keydown path and fails to satisfy the spec/menu requirement for an actual Electron accelerator.

## Verdict rationale
The restart flow is mostly wired through store remounts, renderer shortcut handling, and IPC, but the Electron implementation diverges from the approved change in one required place: the menu item only bakes the shortcut text into its label instead of registering an Electron accelerator. That leaves the desktop shell without the promised `View → Reload Terminal` accelerator behavior and misses a required scenario from the spec, so this change needs rework before it can pass.
