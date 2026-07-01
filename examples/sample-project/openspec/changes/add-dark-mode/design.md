# Design: Add Dark Mode

## Technical Approach
- A `ThemeProvider` wraps the app and stores the current theme in React state,
  hydrated from `localStorage.theme`.
- All colors are declared as CSS custom properties under `:root` and
  `[data-theme="dark"]`.
- The toggle writes `data-theme` to `<html>` and persists the choice.

## Considerations
- Avoid a flash of the wrong theme on first paint by reading localStorage in a
  blocking inline script before React mounts.
