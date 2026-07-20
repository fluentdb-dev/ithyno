## 1. CSS: variables extraction

- [x] 1.1 Audit `web/src/styles.css` for hex / rgb / named color literals; group by role
- [x] 1.2 Add `:root` block with variables: `--bg-page`, `--bg-panel`, `--bg-hover`, `--fg-primary`, `--fg-muted`, `--border`, `--border-strong`, `--accent`, `--accent-hover`, `--danger`, `--warning`, `--success`, `--stderr`
- [x] 1.3 Replace each literal with `var(--…)` — preserve visual result exactly (dark palette default remains the current look)

## 2. CSS: two palettes

- [x] 2.1 `.theme-dark` block redefines variables (current values) — implemented as `:root[data-theme="dark"]` (design decision: attribute selector, not class)
- [x] 2.2 `.theme-light` block defines the light palette (readable on white bg, sufficient contrast) — implemented as `:root[data-theme="light"]` (GitHub-style Primer palette)
- [x] 2.3 `<html>` receives one of the two classes; default = `.theme-dark` — implemented via `<html data-theme="…">` set by the FOUC guard in `web/index.html`; fallback `:root:not([data-theme])` mirrors dark

## 3. Runtime: theme resolution

- [x] 3.1 `web/src/store.ts` — add `theme: "system" | "light" | "dark"` state (default `"system"`) + `setTheme(t): void`; persist to `localStorage["ithyno.theme"]` (design decision: renamed from `openspec-ui.theme` for consistency with other `ithyno.*` keys); hydrate on module load
- [x] 3.2 New hook `web/src/hooks/useAppliedTheme.ts` — resolves `theme` + `matchMedia("(prefers-color-scheme: dark)")` to `"light" | "dark"`; listens for OS changes when `theme === "system"`
- [x] 3.3 Apply the resolved class to `document.documentElement` in a top-level `useEffect` (or a small `<ThemeProvider>` wrapper) — the hook itself writes `document.documentElement.dataset.theme`; App.tsx calls the hook so the effect runs at the root

## 4. UI: theme toggle

- [x] 4.1 `web/src/components/ThemeToggle.tsx` — tri-state segmented control with icons (Auto / Sun / Moon), reads/writes the store
- [x] 4.2 Mount in the header next to the command-style selector — mounted in Settings > Appearance instead (design decision: preferences are not frequent-enough actions to justify header real estate)
- [x] 4.3 Match existing header pill styling — matches the existing `.layout-toggle` / `.modal-mode` segmented-control aesthetic (panel-2 track, accent-on-panel selected pill)

## 5. Embedded terminal + xterm.js

- [x] 5.1 In `Terminal.tsx`, read applied theme via the hook and pass an xterm `theme` object built from the current CSS variables (use `getComputedStyle(document.documentElement).getPropertyValue("--…")`)
- [x] 5.2 On theme change (subscribe to store), call `term.options.theme = newTheme` to re-color without disposing

## 6. Spec delta

- [x] 6.1 `openspec/changes/add-light-dark-mode/specs/dashboard/spec.md`: MODIFIED requirement covering per-user theme selection + system-follow behavior

## 7. Verification

- [ ] 7.1 With `theme: "system"` and OS light mode, the dashboard renders in the light palette — requires manual smoke (browser + OS toggle)
- [ ] 7.2 With `theme: "system"` and OS dark mode, dashboard renders in dark — requires manual smoke
- [ ] 7.3 Manual `Light` / `Dark` in the toggle overrides system and persists across reloads — requires manual smoke
- [ ] 7.4 Embedded terminal palette (xterm) matches the applied theme; live-switching flips terminal colors without dispose — requires manual smoke
- [ ] 7.5 SGR-colored output in the Agents page `<pre>` remains readable in both palettes (spot-check red/green diff coloring) — requires manual smoke
- [ ] 7.6 OS theme change while the app is open + `theme: "system"` selected flips the dashboard live — requires manual smoke
