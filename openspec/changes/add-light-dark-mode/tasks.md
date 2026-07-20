## 1. CSS: variables extraction

- [ ] 1.1 Audit `web/src/styles.css` for hex / rgb / named color literals; group by role
- [ ] 1.2 Add `:root[data-theme="dark"]` block with variables: `--bg-page`, `--bg-panel`, `--bg-panel-2`, `--bg-hover`, `--fg-primary`, `--fg-muted`, `--border`, `--border-strong`, `--accent`, `--accent-hover`, `--danger`, `--warning`, `--success`, `--stderr` — using current dark values as defined in proposal.md
- [ ] 1.3 Replace each literal with `var(--…)` — preserve visual result exactly (dark palette default remains the current look)

## 2. CSS: light palette

- [ ] 2.1 `:root[data-theme="light"]` block with light palette values from proposal.md
- [ ] 2.2 `<html>` receives `data-theme` attribute (see task 4.1 for the pre-render bootstrap)

## 3. Runtime: theme resolution

- [ ] 3.1 `web/src/store.ts` — add `theme: "system" | "light" | "dark"` state (default `"system"`) + `setTheme(t): void`; persist to `localStorage["ithyno.theme"]`; hydrate on module load
- [ ] 3.2 New hook `web/src/hooks/useAppliedTheme.ts` — resolves `theme` + `matchMedia("(prefers-color-scheme: dark)")` to `"light" | "dark"`; listens for OS changes when `theme === "system"`
- [ ] 3.3 Apply the resolved value to `document.documentElement.dataset.theme` in a top-level `useEffect`

## 4. FOUC guard

- [ ] 4.1 `web/index.html` — inline `<script>` in `<head>` that reads `localStorage["ithyno.theme"]`, resolves system if needed, and sets `document.documentElement.dataset.theme` before React mounts. Guard against SSR / non-browser envs (typeof window checks).

## 5. UI: theme toggle in Settings

- [ ] 5.1 `web/src/components/ThemeToggle.tsx` — tri-state segmented control with icons (Auto / Sun / Moon), reads/writes the store
- [ ] 5.2 Mount in `web/src/pages/Settings.tsx` next to the `parallelExecution` checkbox as a new section (title: "Theme")
- [ ] 5.3 Match existing Settings section styling

## 6. Embedded terminal + xterm.js

- [ ] 6.1 In `Terminal.tsx`, read applied theme via the hook and pass an xterm `theme` object built from the current CSS variables (use `getComputedStyle(document.documentElement).getPropertyValue("--…")`)
- [ ] 6.2 On theme change (subscribe to store), call `term.options.theme = newTheme` to re-color without disposing

## 7. Spec delta

- [ ] 7.1 `openspec/changes/add-light-dark-mode/specs/dashboard/spec.md`: MODIFIED requirement covering per-user theme selection + system-follow behavior + Settings-tab entry point

## 8. Verification

- [ ] 8.1 `npm test && npm run typecheck && npm run build` clean
- [ ] 8.2 With `theme: "system"` and OS light mode, the dashboard renders in the light palette
- [ ] 8.3 With `theme: "system"` and OS dark mode, dashboard renders in dark
- [ ] 8.4 Manual `Light` / `Dark` in the Settings toggle overrides system and persists across reloads
- [ ] 8.5 No FOUC on first load — the pre-render script sets `data-theme` before React mounts
- [ ] 8.6 Embedded terminal palette (xterm) matches the applied theme; live-switching flips terminal colors without dispose
- [ ] 8.7 SGR-colored output in the Agents page `<pre>` remains readable in both palettes (spot-check red/green diff coloring)
- [ ] 8.8 OS theme change while the app is open + `theme: "system"` selected flips the dashboard live

## 9. Post-impl

- [ ] 9.1 `outcome.md` written
- [ ] 9.2 `/ithy-opsx:archive add-light-dark-mode`
