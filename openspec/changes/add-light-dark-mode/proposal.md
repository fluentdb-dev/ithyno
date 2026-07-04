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
  Group by role: `--bg-*` (background), `--fg-*` (foreground), `--border-*`, `--accent-*`, `--danger`, `--muted`, etc.
- **Two palettes: `.theme-light` and `.theme-dark`.** Each defines
  the same variables with mode-appropriate values. Applied on
  `<html>` (or `<body>`) via a class.
- **System detection + manual override.** On first render:
  - If `localStorage["openspec-ui.theme"]` is set, use it (`"light"` /
    `"dark"` / `"system"`).
  - Otherwise fall back to `matchMedia("(prefers-color-scheme:
    dark)")`.
- **Theme toggle.** A small tri-state toggle in the header (next to
  `commandStyle`): `System` / `Light` / `Dark`. Persists to
  localStorage. Listens for OS scheme changes when `System` is
  selected.
- **Embedded terminal + xterm.js theme.** Xterm's `theme` option is
  passed at construction; feed it the current CSS variable values so
  the terminal palette matches. When the theme toggle flips, the
  terminal re-renders with the new palette (cheap: xterm has a
  `theme` setter).
- **Agents page `<pre>` output** (post-revert-agent-pty-layers)
  already uses inline SGR colors — keep those regardless of theme;
  colors from the CLI encode semantic meaning, not decoration.

## Capabilities

### Modified Capabilities

- `dashboard`: user-selectable light / dark / system theme,
  persisted per browser.

## Impact

- `web/src/styles.css` — variable extraction (mechanical), `.theme-light` block
- `web/src/store.ts` — `theme: "system" | "light" | "dark"` slice + `setTheme`
- New `web/src/hooks/useAppliedTheme.ts` — resolves `theme` +
  `prefers-color-scheme` to the applied class, listens to media
  query changes
- New `web/src/components/ThemeToggle.tsx` — tri-state button in header
- `web/src/components/Terminal.tsx` — feed current palette to xterm; re-apply on theme change

## Out of scope

- **Per-user custom palettes.** Two curated palettes only; theme
  hacking is a future power-user feature.
- **Print-specific stylesheet.** Not a print-first tool.
- **High-contrast / accessibility variants.** Distinct concern
  (WCAG-driven), separate change.
- **Sidebar / editor theme sync** (matching the user's IDE's
  colors). Interesting but requires per-channel plumbing; deferred.
