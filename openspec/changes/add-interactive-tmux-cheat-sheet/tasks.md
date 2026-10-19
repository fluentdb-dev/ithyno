## 1. Action Catalog and Provider Adapter

- [ ] 1.1 Land or otherwise incorporate the `add-tmux-session-browser-and-history` topology, selection, and history foundation before implementing this dependent change.
- [ ] 1.2 Define a shared typed cheat-sheet catalog with stable action IDs, groups, labels, default tmux shortcuts, provider support, and executable versus reference-only state.
- [ ] 1.3 Extend the tmux provider adapter with the allowlisted navigation and layout actions using fixed subprocess argument vectors and bounded timeouts.
- [ ] 1.4 Serialize action execution per canonical project session and reject unknown IDs, extra action inputs, missing sessions, unsupported provider actions, and cross-project targets.
- [ ] 1.5 Add adapter tests for every executable action, fixed argv construction, project isolation, concurrent clicks, timeout/error handling, injection rejection, and psmux capability degradation.

## 2. Authenticated Action API

- [ ] 2.1 Add typed action-catalog and action-execution endpoints that reuse the current canonical project root and shared tmux adapter.
- [ ] 2.2 Validate exact request shapes and map unavailable, unsupported, busy, invalid-action, and subprocess failures to explicit responses.
- [ ] 2.3 Add route tests for authentication, catalog output, successful actions, extra-field rejection, destructive reference-only rejection, and multi-project isolation.

## 3. Interactive Cheat-Sheet UI

- [ ] 3.1 Add web types and API functions for the action catalog and semantic action execution.
- [ ] 3.2 Add a discoverable cheat-sheet control to the tmux browser and render actions grouped by navigation, pane layout, window management, history, and session reference.
- [ ] 3.3 Display each action's default shortcut and clearly distinguish executable, provider-unsupported, pending, and reference-only entries.
- [ ] 3.4 Execute supported entries with repeated-click protection, show inline failures, and refresh topology after success without recreating the PTY or WebSocket.
- [ ] 3.5 Connect refresh and retained-history cheat-sheet entries to the existing client-side behavior.
- [ ] 3.6 Add component and pure-logic tests for grouping, shortcut rendering, supported and disabled states, action execution, error handling, topology refresh, and connection preservation.

## 4. Documentation and Verification

- [ ] 4.1 Document the interactive cheat sheet, default-binding caveat, supported action set, provider degradation, and reference-only destructive shortcuts.
- [ ] 4.2 Run focused server and web tests, the full test suite, typecheck, build, and strict OpenSpec validation.
- [ ] 4.3 Manually verify navigation, window creation, pane splitting, zoom/layout actions, history/refresh helpers, and Manager continuity in an ithyno-managed tmux session.
