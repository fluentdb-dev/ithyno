## 1. CSS: variables extraction

- [x] 1.1 Audit `web/src/styles.css` for hex / rgb / named color literals; group by role
- [x] 1.2 Add `:root[data-theme="dark"]` block with variables
- [x] 1.3 Replace each literal with `var(--…)` — dark palette default preserved

## 2. CSS: light palette

- [x] 2.1 `:root[data-theme="light"]` block — palette tuned per light_mode_review.md
- [x] 2.2 `<html>` receives `data-theme` attribute (set by FOUC guard)

## 3. Runtime: theme resolution

- [x] 3.1 `web/src/store.ts` — theme slice + setTheme + localStorage.ithyno.theme
- [x] 3.2 New hook `web/src/hooks/useAppliedTheme.ts` — resolver + matchMedia subscription
- [x] 3.3 App.tsx calls `useAppliedTheme()` at root; hook writes `document.documentElement.dataset.theme`

## 4. FOUC guard

- [x] 4.1 `web/index.html` inline pre-render script sets `data-theme` before React mounts

## 5. UI: theme toggle in Settings

- [x] 5.1 `web/src/components/ThemeToggle.tsx` — tri-state segmented control (Auto / Sun / Moon)
- [x] 5.2 Mounted in Settings > Appearance section — toggle placed left of "Theme" label
- [x] 5.3 Light-mode override adds blue border + card shadow on active pill

## 6. Embedded terminal + xterm.js

- [x] 6.1 `Terminal.tsx` passes xterm theme built from CSS vars (getComputedStyle)
- [x] 6.2 Live re-color via `term.options.theme = newTheme` (no dispose, scrollback preserved)

## 7. Spec delta

- [x] 7.1 ADDED `Selectable Theme (Light / Dark / System)` in dashboard spec

## 8. Verification

- [x] 8.1 `npm test && npm run typecheck && npm run build` clean (289 passing)
- [ ] 8.2 System=light, OS light → light palette — requires manual smoke
- [ ] 8.3 System=light, OS dark → dark palette — requires manual smoke
- [x] 8.4 Manual Light/Dark toggle overrides system + persists — puppeteer-verified 2026-07-20
- [ ] 8.5 No FOUC on first load — requires manual smoke
- [x] 8.6 xterm palette matches theme; live re-color — structurally verified via Terminal.tsx code path
- [ ] 8.7 SGR-colored Agents output readable in both palettes — requires manual smoke with running job
- [ ] 8.8 OS theme change flips app live (System mode) — requires manual smoke

## 9. Post-impl

- [x] 9.1 `outcome.md` written
- [ ] 9.2 `/ithy-opsx:archive add-light-dark-mode`
