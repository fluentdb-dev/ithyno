# Outcome — add-light-dark-mode

## ✅ Worked

- **`data-theme` attribute won over `.theme-*` class**. Modern
  Tailwind-style attribute selectors (`:root[data-theme="light"]`)
  read cleaner than the class-swap variant and let the FOUC guard
  script write a single attribute instead of manipulating
  classList. Zero specificity conflicts across the codebase.
- **FOUC guard closes the pre-hydration gap cleanly**. `web/index.html`
  gains a tiny inline `<script>` that reads `localStorage["ithyno.theme"]`
  and sets `document.documentElement.dataset.theme` before the React
  bundle mounts. First paint uses the correct palette.
- **Xterm live re-color without dispose worked out of the box**. Setting
  `term.options.theme = newTheme` (via `useAppliedTheme` subscription in
  `Terminal.tsx`) flips terminal colors mid-session and preserves
  scrollback.
- **Parallel dispatch dogfooded the multi-dispatch flow**. This change
  and `add-kanban-search-filter` both landed via Agent tool parallel
  calls (the Task-tool branch of `/ithy-opsx:dispatch-multi`). Two
  subagents ran in isolated worktrees concurrently.
- **Puppeteer verify picked up the design flaws quickly**. Ran a
  puppeteer script through the worktree Vite (port 5174) to view
  screenshots without merging. The reviewer wrote
  `light_mode_review.md` catching 7 specific contrast / hierarchy
  issues. Fixes landed on the same agent branch as a polish commit.

## ⚠️ Surprises

- **Kanban col background was inverted between modes originally**.
  Existing CSS mapped `--panel` (darker in dark) to col and `--panel-2`
  (lighter in dark) to card — giving elevated cards in dark. In the
  new light palette, `--panel` was pure white and `--panel-2` was
  off-white — cards became DARKER than columns, opposite of elevation.
  Fix: swap the mapping so col uses `--panel-2` (dim) and card uses
  `--panel` (bright). Works in both modes.
- **Vite proxy target was hardcoded to `localhost:4321`**. Blocked
  running parallel dev stacks unless the worktree set its own port.
  Punted on the env-driven config change once we discovered
  `npm run dev:web -- --port 5174` (Vite-only against main's API) was
  simpler.
- **Puppeteer MCP was installed but not in this session's server list**.
  User had `/Users/cishihara/Development/mcp-browser` with
  `@modelcontextprotocol/server-puppeteer`. `claude mcp list` showed
  it connected but session boot didn't register it. Worked around
  by importing puppeteer via a Node script that reached into the
  user's install path directly.
- **`--accent-fg` was undefined**, causing text on accent buttons to
  fall back to `var(--fg)` (dark on dark blue). Light-mode override:
  `color: var(--accent-fg-on-solid)` (which IS defined).
- **Disabled state pattern was `opacity: 0.5` on white-on-accent**.
  Classic "lightens bg and text at the same rate" trap. For light
  mode, replaced with explicit Blue 100 bg + Blue 800 text per
  review Pattern B.
- **Merge conflict resolution didn't stick the first time**. My
  edit to resolve tasks.md conflict didn't persist through the
  merge commit; had to redo it in a follow-up fix commit before
  archive. Likely cause: the compound tool call had a bad parameter
  that silently dropped the edit. Save the write, verify it
  landed, THEN commit.

## 🔁 Differently next time

- **Land palette review together with palette values**. This change's
  initial palette was picked from GitHub Primer without an a11y
  sanity check. A reviewer pass (like `light_mode_review.md`) at the
  propose stage would have saved a round-trip.
- **Puppeteer verify from day one**. Once the setup worked, iteration
  was fast. Would use as the default browser smoke rather than
  "user opens the browser and reports back".

## 🌱 Follow-ups

- **Terminal `[connection error]` / `[disconnected]` color** —
  review item 4. xterm output is client-controlled by the terminal
  wrapper's connection state; add a themed error color in a separate
  change.
- **`vite.config.ts` env-driven ports** for cleaner parallel-worktree
  dev. Not needed today; would matter if per-worktree fully-independent
  dev stacks become standard.
- **Manual smoke** for tasks 8.2, 8.3, 8.5, 8.7, 8.8 — OS-level
  toggle + running job. Deferred to a user-driven follow-up session.
- **Extract puppeteer review pattern into a skill**. Script + review
  markdown could become `ithy-opsx:visual-review <change-id>` for
  future UI changes.
