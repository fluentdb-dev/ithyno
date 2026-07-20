---
tags: [feature/theme, area/web]
---

## Why

The dashboard's CSS bakes in a single dark palette. Users on macOS /
Windows / Linux with system light-mode preferences get a jarring
dark surface embedded in an otherwise light editor / VS Code, and
users who prefer dark mode have no explicit control (system swap
does nothing). This has been a repeat request during dogfooding.

The stylesheet already uses some CSS variables for accent + border
colors, so the migration is mostly about extracting the remaining
literals and adding a second palette + a mode toggle.

## What Changes

- **CSS variables extraction.** Move every hard-coded color literal
  in `web/src/styles.css` into a CSS custom property under `:root`.
  Group by role: `--bg-*` (background), `--fg-*` (foreground),
  `--border-*`, `--accent-*`, `--danger`, `--muted`, etc.
- **Two palettes gated by `data-theme` attribute.** `<html>` receives
  `data-theme="dark"` or `data-theme="light"`. CSS declares
  `:root[data-theme="dark"] { ... }` and
  `:root[data-theme="light"] { ... }`. This matches modern practice
  (Tailwind, shadcn) and reads more cleanly than the class-based
  variant.
- **System detection + manual override.** On first render:
  - If `localStorage["ithyno.theme"]` is set, use it (`"light"` /
    `"dark"` / `"system"`).
  - Otherwise default to `"system"` and resolve via
    `matchMedia("(prefers-color-scheme: dark)")`.
- **Pre-render FOUC guard.** `web/index.html` gains a tiny inline
  `<script>` that reads `localStorage["ithyno.theme"]` + resolves
  the applied theme, then sets `data-theme` on `<html>` before any
  React code runs. Without this the app briefly flashes the
  hard-coded default before the store hydrates.
- **Theme toggle in Settings tab.** A tri-state segmented control
  (`System` / `Light` / `Dark`) in `web/src/pages/Settings.tsx`,
  next to the `parallelExecution` checkbox already there. Persists
  to localStorage. Listens for OS scheme changes when `System` is
  selected. The header stays unchanged — Settings is where infrequent
  configuration lives.
- **Embedded terminal + xterm.js theme.** Xterm's `theme` option is
  passed at construction; feed it the current CSS variable values so
  the terminal palette matches. When the theme toggle flips, the
  terminal re-renders with the new palette via
  `term.options.theme = newTheme` (no dispose, scrollback preserved).
- **Agents page `<pre>` output** (post-revert-agent-pty-layers)
  already uses inline SGR colors — keep those regardless of theme;
  colors from the CLI encode semantic meaning, not decoration.

## Palettes (pinned)

**Dark** (current, unchanged):
```
--bg-page:     #0f1115
--bg-panel:    #181b22
--bg-panel-2:  #1f232c
--bg-hover:    #262b36
--border:      #2a2f3a
--border-strong: #3a4152
--fg-primary:  #e6e9ef
--fg-muted:    #8b93a3
--accent:      #6ea8fe
--accent-hover: #85b7ff
--success:     #3fb950
--danger:      #f85149
--warning:     #d29922
--stderr:      #ff7b72
```

**Light** (new):
```
--bg-page:     #fafbfc
--bg-panel:    #ffffff
--bg-panel-2:  #f4f5f7
--bg-hover:    #eef0f3
--border:      #d7dbe0
--border-strong: #b8bec6
--fg-primary:  #1a1d21
--fg-muted:    #5a6270
--accent:      #0969da    /* GitHub-style blue */
--accent-hover: #0550ae
--success:     #1a7f37
--danger:      #cf222e
--warning:     #9a6700
--stderr:      #cf222e
```

## Capabilities

### Modified Capabilities

- `dashboard`: user-selectable light / dark / system theme,
  persisted per browser via `localStorage["ithyno.theme"]`,
  configured from the Settings tab.

## Impact

- `web/index.html` — inline pre-render `<script>` for FOUC guard
- `web/src/styles.css` — variable extraction (mechanical),
  `[data-theme="dark"]` and `[data-theme="light"]` variable blocks
- `web/src/store.ts` — `theme: "system" | "light" | "dark"` slice +
  `setTheme`; persists to `localStorage["ithyno.theme"]`
- New `web/src/hooks/useAppliedTheme.ts` — resolves `theme` +
  `prefers-color-scheme` to the applied `data-theme` value, listens
  to media query changes
- New `web/src/components/ThemeToggle.tsx` — tri-state segmented
  control mounted in Settings
- `web/src/pages/Settings.tsx` — new `<ThemeToggle>` section
- `web/src/components/Terminal.tsx` — feed current palette to xterm;
  re-apply on theme change

## Out of scope

- **Per-user custom palettes.** Two curated palettes only; theme
  hacking is a future power-user feature.
- **Print-specific stylesheet.** Not a print-first tool.
- **High-contrast / accessibility variants.** Distinct concern
  (WCAG-driven), separate change.
- **Header quick toggle.** Deferred; Settings tab is enough for a
  once-per-user preference.
- **Electron / VS Code chrome sync.** Native window chrome (title
  bar, menu, tab colors) is left to the OS. This change only
  covers the dashboard webview surface.
- **Sidebar / editor theme sync** (matching the user's IDE's
  colors). Interesting but requires per-channel plumbing; deferred.
