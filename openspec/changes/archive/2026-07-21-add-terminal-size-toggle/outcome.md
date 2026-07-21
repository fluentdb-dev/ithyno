# Outcome: add-terminal-size-toggle

## Worked

- Adding `terminalSize: TerminalSize` to the Zustand store and wiring it to App.tsx layout classes was straightforward — four options, one state field, zero persistence.
- The `TerminalSizeToggle` component followed the `ThemeToggle` pattern exactly: a segmented row of icon buttons, `aria-pressed`, `data-state="active"`, 14×14 SVG icons.
- Placing the toggle left of "Terminal" was a one-line flex-order change in the `terminal-head` div in App.tsx (the header lives in App, not in Terminal.tsx).
- CSS layout for fullscreen and half was clean: `.app.terminal-fullscreen .content { display: none }` + `.app.terminal-fullscreen .global-terminal { width: 100%; left: 0 }` and the symmetric half rules. The terminal is already `position: fixed`, so overriding width and left just worked.
- Hidden state: rendering a standalone `<TerminalSizeToggle />` inside a `terminal-hidden-anchor` div (fixed, bottom-right) reuses the same component for re-show — no separate logic needed.
- Removing the "Hide Terminal" button from ChangeDetail was a clean 5-line delete; no other page had a similar affordance.
- All 306 existing tests continued to pass; 9 new store-level tests were added in `TerminalSizeToggle.test.ts`.

## Surprises

- The `terminalVisible` store field (which had localStorage persistence) was NOT removed — it's still consumed by App.tsx to handle the pre-existing "terminal hidden on first load" persistence path. The new `terminalSize` field sits alongside it. This is a mild duplication but safe: the two fields are orthogonal (visible=false hides via CSS `display: none`; size=hidden unmounts). A follow-up could unify them.
- The terminal panel header is defined in App.tsx (not in Terminal.tsx), so task 3.1's wording about "Terminal.tsx or the parent" was resolved to App.tsx — which was the right call given the header JSX was already there.
- The `global-terminal.hidden` CSS class (`.global-terminal.hidden { display: none }`) became redundant — with `terminalSize === "hidden"` the aside is unmounted entirely (not just CSS-hidden). The class is still in the stylesheet but no longer applied; it's harmless dead CSS.

## Differently

- Would consider removing `terminalVisible` / `setTerminalVisible` entirely and routing all visibility through `terminalSize`. That would eliminate the dual-state confusion at the cost of a slightly larger refactor touching ChangeDetail (which used to read `terminalVisible` for its toggle button — but that button is now gone).
- The standalone hidden-anchor toggle sits bottom-right over all page content. A flush-to-edge treatment (e.g., a tiny tab protruding from the right edge) would be less intrusive on content-heavy pages.

## Follow-ups

- **Per-project persistence**: opt-in `localStorage` or server-settings persistence of the last selected size (useful for users who always prefer Half).
- **Keyboard shortcuts**: e.g., `Ctrl+Shift+F` for Fullscreen, `Ctrl+Shift+H` for Half, etc.
- **Resize dragger**: instead of a fixed 50/50 split for Half, expose a drag handle so users can set an arbitrary split ratio.
- **Unify visibility state**: merge `terminalVisible` + `terminalSize` into a single source of truth.
