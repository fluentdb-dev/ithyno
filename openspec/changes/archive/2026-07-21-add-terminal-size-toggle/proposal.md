---
tags: [terminal, ui, dashboard, embedded-terminal]
execution: worktree
---

## Why

The dashboard currently exposes a "Hide Terminal" button ONLY on the
change detail page. That's a UX gap: the terminal is a global
element (visible on every route since `add-worktree-change-view`),
but the affordance to hide it lives on one page and isn't
discoverable from Overview, Specs, Archive, Agents, Docs, or
Settings.

There is also no way to make the terminal bigger from the UI — the
terminal is a fixed-size panel, and users who want more terminal
real estate for long Claude sessions have no in-app control.

This change introduces a single **terminal-size toggle** on the
terminal panel header itself (left of the "Terminal" label). The
toggle bundles four options:

1. **全画面 (Fullscreen)** — content area is filled by the terminal;
   the page content (Kanban / Specs / etc.) collapses. Topbar
   remains visible so navigation is preserved.
2. **半分 (Half)** — content area splits 50/50 between page content
   and terminal.
3. **今のサイズ (Default)** — the current app-default terminal size
   (the size before this change existed). The baseline.
4. **非表示 (Hidden)** — terminal panel not rendered.

Sizing is **not persisted** — every session starts on `Default`.
Rationale: sessions are short-lived and preferences would add
per-project persistence + settings surface that isn't worth the
scope right now.

The "Hide Terminal" button on the change page is **removed**. Its
job is taken over by the toggle's `Hidden` option, which is
globally accessible.

## What Changes

- **`web/src/components/Terminal.tsx`** (or a new sibling
  component like `TerminalSizeToggle.tsx`): render a small toggle
  control positioned to the left of the "Terminal" label in the
  terminal panel header. The toggle exposes four states with
  clear visual affordance (icon buttons or a segmented control).
- **App-level layout wiring**: `web/src/App.tsx` (or wherever
  `.app.with-terminal` layout is decided) reads a new store field
  `terminalSize: "fullscreen" | "half" | "default" | "hidden"` and
  applies the corresponding layout class.
- **CSS in `web/src/styles.css`**: four layout classes on the app
  root:
  - `.terminal-fullscreen` — content area = terminal only, `main`
    content hidden or collapsed to zero.
  - `.terminal-half` — content and terminal each take 50% of the
    content area (horizontally split, or 50/50 vertically — final
    orientation decided during implementation to match the current
    docking).
  - `.terminal-default` — current behavior (no override).
  - `.terminal-hidden` — terminal panel not mounted (React
    conditional; not just CSS `display: none`, so the WebSocket
    also tears down and stops accumulating output).
- **Remove "Hide Terminal" from change page**: `ChangeDetail.tsx`
  (or wherever the button lives). The affordance is replaced by
  the toggle's Hidden option.
- **Store**: add `terminalSize` state with default `"default"` and
  a `setTerminalSize(size)` action. No persistence — resets on
  each session.

## Success

- Terminal panel header shows a size toggle to the left of
  "Terminal", offering 4 options: Fullscreen / Half / Default /
  Hidden.
- Selecting **Fullscreen** collapses the page content and lets the
  terminal fill the content area. Topbar remains visible and
  navigation still works.
- Selecting **Half** splits the content area 50/50 between page
  content and terminal.
- Selecting **Default** returns to the pre-change layout.
- Selecting **Hidden** unmounts the terminal panel — no more DOM,
  no more WebSocket. Page content occupies the full content area.
- Change detail page NO LONGER shows a "Hide Terminal" button. The
  same functionality is available via the toggle's Hidden option,
  which is reachable from any route (as long as the terminal was
  visible when the user last set the toggle).
- When Hidden is selected, **only the size toggle icon remains
  visible** (the "Terminal" label and body are gone). Clicking it
  re-selects a non-Hidden option to bring the terminal back. This
  keeps the entry point discoverable without dedicating a full
  header bar to a hidden panel.
- Reloading the page resets the size to Default.
- No accidental terminal-restart triggered by the size toggle (the
  PTY connection persists across `default` ↔ `half` ↔ `fullscreen`
  transitions; only `hidden` unmounts).
