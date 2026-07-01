# Proposal: Add Dark Mode

## Intent
Users working at night find the bright dashboard straining. We want a
light/dark theme toggle that persists across sessions.

## Scope
In scope: theme toggle, CSS custom properties, persistence in localStorage.
Out of scope: per-component theming, system-preference auto-detection (later).

## Approach
Introduce a ThemeContext that swaps a `data-theme` attribute on the root
element. Colors move to CSS custom properties so the switch is instant.
