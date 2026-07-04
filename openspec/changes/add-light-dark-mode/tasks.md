## 1. CSS: variables extraction

- [ ] 1.1 Audit `web/src/styles.css` for hex / rgb / named color literals; group by role
- [ ] 1.2 Add `:root` block with variables: `--bg-page`, `--bg-panel`, `--bg-hover`, `--fg-primary`, `--fg-muted`, `--border`, `--border-strong`, `--accent`, `--accent-hover`, `--danger`, `--warning`, `--success`, `--stderr`
- [ ] 1.3 Replace each literal with `var(--…)` — preserve visual result exactly (dark palette default remains the current look)

## 2. CSS: two palettes

- [ ] 2.1 `.theme-dark` block redefines variables (current values)
- [ ] 2.2 `.theme-light` block defines the light palette (readable on white bg, sufficient contrast)
- [ ] 2.3 `<html>` receives one of the two classes; default = `.theme-dark`

## 3. Runtime: theme resolution

- [ ] 3.1 `web/src/store.ts` — add `theme: "system" | "light" | "dark"` state (default `"system"`) + `setTheme(t): void`; persist to `localStorage["openspec-ui.theme"]`; hydrate on module load
- [ ] 3.2 New hook `web/src/hooks/useAppliedTheme.ts` — resolves `theme` + `matchMedia("(prefers-color-scheme: dark)")` to `"light" | "dark"`; listens for OS changes when `theme === "system"`
- [ ] 3.3 Apply the resolved class to `document.documentElement` in a top-level `useEffect` (or a small `<ThemeProvider>` wrapper)

## 4. UI: theme toggle

- [ ] 4.1 `web/src/components/ThemeToggle.tsx` — tri-state segmented control with icons (Auto / Sun / Moon), reads/writes the store
- [ ] 4.2 Mount in the header next to the command-style selector
- [ ] 4.3 Match existing header pill styling

## 5. Embedded terminal + xterm.js

- [ ] 5.1 In `Terminal.tsx`, read applied theme via the hook and pass an xterm `theme` object built from the current CSS variables (use `getComputedStyle(document.documentElement).getPropertyValue("--…")`)
- [ ] 5.2 On theme change (subscribe to store), call `term.options.theme = newTheme` to re-color without disposing

## 6. Spec delta

- [ ] 6.1 `openspec/changes/add-light-dark-mode/specs/dashboard/spec.md`: MODIFIED requirement covering per-user theme selection + system-follow behavior

## 7. Verification

- [ ] 7.1 With `theme: "system"` and OS light mode, the dashboard renders in the light palette
- [ ] 7.2 With `theme: "system"` and OS dark mode, dashboard renders in dark
- [ ] 7.3 Manual `Light` / `Dark` in the toggle overrides system and persists across reloads
- [ ] 7.4 Embedded terminal palette (xterm) matches the applied theme; live-switching flips terminal colors without dispose
- [ ] 7.5 SGR-colored output in the Agents page `<pre>` remains readable in both palettes (spot-check red/green diff coloring)
- [ ] 7.6 OS theme change while the app is open + `theme: "system"` selected flips the dashboard live
