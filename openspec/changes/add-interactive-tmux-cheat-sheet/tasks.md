## 1. Action Catalog and Provider Adapter

- [x] 1.1 Land or otherwise incorporate the `add-tmux-session-browser-and-history` topology, selection, and history foundation before implementing this dependent change.
- [x] 1.2 Define a shared typed cheat-sheet catalog with stable action IDs, groups, labels, default tmux shortcuts, provider support, and executable versus reference-only state.
- [x] 1.3 Extend the tmux provider adapter with the allowlisted navigation and layout actions using fixed subprocess argument vectors and bounded timeouts.
- [x] 1.4 Serialize action execution per canonical project session and reject unknown IDs, extra action inputs, missing sessions, unsupported provider actions, and cross-project targets.
- [x] 1.5 Add adapter tests for every executable action, fixed argv construction, project isolation, concurrent clicks, timeout/error handling, injection rejection, and psmux capability degradation.

## 2. Authenticated Action API

- [x] 2.1 Add typed action-catalog and action-execution endpoints that reuse the current canonical project root and shared tmux adapter.
- [x] 2.2 Validate exact request shapes and map unavailable, unsupported, busy, invalid-action, and subprocess failures to explicit responses.
- [x] 2.3 Add route tests for authentication, catalog output, successful actions, extra-field rejection, destructive reference-only rejection, and multi-project isolation.

## 3. Interactive Cheat-Sheet UI

- [x] 3.1 Add web types and API functions for the action catalog and semantic action execution.
- [x] 3.2 Add a discoverable cheat-sheet control to the tmux browser and render actions grouped by navigation, pane layout, window management, history, and session reference.
- [x] 3.3 Display each action's default tmux key sequence, show the prefix note at the top of the cheat sheet, and clearly distinguish executable, provider-unsupported, pending, and reference-only entries; keep pane/window kill reference-only while allowing explicit Stop session for the current project and a validated per-pane close action with inline confirmation.
- [x] 3.4 Execute supported entries with repeated-click protection, show inline failures, and refresh topology after success without recreating the PTY or WebSocket; closing the current session uses the canonical project-derived session name only.
- [x] 3.5 Connect refresh and retained-history cheat-sheet entries to the existing client-side behavior.
- [x] 3.6 Add component and pure-logic tests for grouping, shortcut rendering, supported and disabled states, action execution, error handling, topology refresh, confirmation/cancel/confirm flow, and connection preservation.

## 4. Documentation and Verification

- [x] 4.1 Document the interactive cheat sheet, default-binding caveat, supported action set, provider degradation, and reference-only destructive shortcuts.
- [x] 4.2 Run focused server and web tests, the full test suite, typecheck, build, and strict OpenSpec validation.
- [ ] 4.3 Manually verify navigation, window creation, pane splitting, zoom/layout actions, history/refresh helpers, and Manager continuity in an ithyno-managed tmux session.
