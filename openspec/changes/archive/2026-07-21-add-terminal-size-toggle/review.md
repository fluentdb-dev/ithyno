---
verdict: pass
reviewer: manager-hand-review
reason: copilot policy error persisting; Manager fallback per updated dispatch skill
---

# Review: add-terminal-size-toggle

## Findings
- no blocking issues found

## Verdict rationale

Implementation matches the narrowed spec:

- **Store**: `terminalSize` state + `setTerminalSize()` action added to `store.ts` per Requirement "Toggle position". No persistence layer — reset happens on each mount by React's initial-state contract, satisfying "Size does not persist across page reloads".
- **Component**: `TerminalSizeToggle.tsx` — 4 icon buttons, `aria-pressed` marking active option per spec.
- **Header wiring**: toggle mounted LEFT of "Terminal" label in `App.tsx`'s terminal panel header per spec's "Toggle position" scenario.
- **Layout classes**: `App.tsx` computes `terminalLayoutClass` from the store value; CSS handles `terminal-fullscreen` (content collapse) + `terminal-half` (50/50 split). Default = no class = baseline layout, matches "Default returns to baseline layout".
- **Hidden state**: terminal body and "Terminal" label unmount, standalone toggle icon anchor remains at dock corner — spec's "Hidden unmounts the terminal panel" + "Re-show from Hidden via the standalone toggle" scenarios both covered.
- **PTY preservation**: default ↔ half ↔ fullscreen transitions don't remount `<Terminal />` (React keeps the same instance since only the outer `.app` className changes) — satisfies "Size changes preserve the PTY session".
- **Hidden closes PTY**: since `<Terminal />` is fully unmounted (React conditional), the cleanup effect fires — `ws.close()` runs, matching "Hidden closes the PTY".
- **ChangeDetail cleanup**: "Hide Terminal" button removed from `ChangeDetail.tsx`. Spec's "Change detail page has no 'Hide Terminal' button" satisfied.
- **9 store-level tests** + integration assertions for aria-pressed transitions and ChangeDetail button absence.
- All automated checks pass: 304 tests, typecheck clean, build clean, openspec validate --strict pass.

Change is ready to archive.
