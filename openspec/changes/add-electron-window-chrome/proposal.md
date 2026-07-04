---
tags: [feature/electron, feature/theme, area/electron, area/web]
---

## Why

The Electron shell renders the dashboard inside a stock OS chrome —
a light title bar on top of the dashboard's dark UI. The visual seam
where the OS bar meets the Kanban's `#0f1115` panel is jarring, and
it looks unfinished next to the Kanban card content.

Electron exposes first-class options for both hiding the standard
bar (revealing the surface underneath) and painting a custom-colored
overlay where the window controls sit. Wiring those up gives the app
a seamless dark bar on every platform, and the same knobs cooperate
with `add-light-dark-mode` (which will change the target color) via
a small IPC handshake.

## What Changes

### macOS: hidden inset + solid background

- Set `titleBarStyle: 'hiddenInset'` on the `BrowserWindow`.
- The system stops drawing its own title bar; the traffic-light
  buttons stay in the top-left corner over whatever surface the
  renderer paints.
- Set `backgroundColor: '#0f1115'` on the window so the launch
  frame doesn't flash white before the renderer paints.
- Renderer CSS reserves ~28px of "safe area" at the top (padding on
  the top-level `<body>` or the header) so the traffic lights don't
  overlap header content.

### Windows / Linux: custom title bar overlay

- Set `titleBarStyle: 'hidden'` + `titleBarOverlay: { color:
  '#0f1115', symbolColor: '#e6e9ef', height: 32 }`.
- OS draws window controls on top of the specified color; buttons
  render with `symbolColor`.
- Same `backgroundColor` for the initial paint.

### Runtime theme sync (integrates with `add-light-dark-mode`)

- New IPC channel `openspec-ui:set-title-bar-color(color,
  symbolColor)` from renderer → main.
- Renderer's applied-theme hook posts the target colors when the
  theme flips.
- Main calls:
  - macOS: `window.setBackgroundColor(color)` — the traffic lights
    stay visible; only the surrounding surface changes.
  - Windows / Linux: `window.setTitleBarOverlay({ color, symbolColor,
    height: 32 })` — first-class dynamic recolor.

### Preserving existing menu / lifecycle

- No changes to `menu.ts` or the `whenReady` / `before-quit` chain.
- Window creation site (`createWindowForProject`) gets the new
  options; every other behavior stays the same.

## Capabilities

### Modified Capabilities

- `electron-shell`: the BrowserWindow renders without the OS's
  default title bar and paints a Kanban-matched dark surface where
  the bar would have been. The color is dynamically updated when
  the dashboard theme flips.

## Impact

- `electron/src/main.ts` — `titleBarStyle`, `titleBarOverlay`,
  `backgroundColor`, IPC handler for `openspec-ui:set-title-bar-color`
- `web/src/styles.css` — top safe-area padding on macOS (`@media
  (platform: mac)` via a runtime-detected class)
- `web/src/preload.ts` (or wherever Electron IPC is exposed to
  renderer) — expose the setter
- `web/src/hooks/useAppliedTheme.ts` (from `add-light-dark-mode`)
  — post the current color pair when Electron runtime is detected

## Out of scope

- **Custom window frame widgets** (draggable regions, min/max
  buttons rendered by the renderer). Complex to get right per
  platform; `titleBarOverlay` on Windows/Linux and traffic lights on
  macOS are enough for v1.
- **Vibrancy / translucency effects** on macOS. Would look nice but
  interacts badly with dark palette + traffic-light contrast;
  deferred.
- **Sidebar-first layouts** that need the toolbar to stretch under
  the traffic lights. Current header layout is centered / narrow;
  redoing that is a separate design change.
- **Standalone Windows / Linux visual QA.** Design + code lands
  here; visual regression across all three OS chromes is a manual
  verification pass, not part of the change itself.
