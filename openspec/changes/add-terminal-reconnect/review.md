---
verdict: needs-rework
---

# Review: add-terminal-reconnect

## Findings
- [medium] electron/src/menu.ts:95 — The `View → Reload Terminal` label always renders the macOS-only `⇧⌘K` hint. The spec requires a macOS glyph **or platform-equivalent** shortcut hint, so Windows/Linux builds should expose a `Ctrl+Shift+K`-style label instead of a Mac-specific chord.

## Verdict rationale
The restart flow itself is wired correctly: the store counter remounts only the terminal, the reconnect button and focus-scoped keyboard handler behave consistently with the embedded-terminal requirements, and the existing PTY cleanup on WebSocket close covers the leak concern. However, the Electron menu implementation still diverges from the approved spec on non-macOS platforms because its discoverability label is not platform-correct, so this change needs a small follow-up before it fully matches the requirement set.
