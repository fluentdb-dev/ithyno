## 1. Server tmux adapter

- [x] 1.1 Add typed tmux provider, capability, session, window, and pane models.
- [x] 1.2 Implement bounded topology discovery for the current project-derived session using structured subprocess arguments and timeouts.
- [x] 1.3 Implement validated window/pane selection scoped to a fresh current-project topology snapshot.
- [x] 1.4 Implement bounded pane-history capture with truncation metadata and no logging or persistence of captured content.
- [x] 1.5 Add adapter unit tests for parsing, missing sessions, unavailable providers, target rejection, selection, capture, limits, and psmux degradation.

## 2. Authenticated local API

- [x] 2.1 Add topology, selection, and history endpoints using the shared tmux adapter and current canonical project root.
- [x] 2.2 Validate all request payloads and map unavailable, unsupported, stale target, and subprocess failures to explicit responses.
- [x] 2.3 Add API-level tests proving project scoping, authentication coverage, and rejection of arbitrary session or pane targets.

## 3. Embedded terminal UI

- [x] 3.1 Add typed web API functions for topology, target selection, and pane-history capture.
- [x] 3.2 Add a compact tmux status/browser control to the embedded terminal header without changing VS Code delegated-terminal behavior.
- [x] 3.3 Render tmux windows as navigable tabs and panes as an accessible active-state list or layout summary.
- [x] 3.4 Add a scrollable history drawer with refresh, client-side search, selectable text, copy, truncation state, loading, empty, and error states.
- [x] 3.5 Refresh topology after target selection while preserving the PTY, WebSocket, terminal size, and reconnect state.
- [x] 3.6 Add component and pure-logic tests for capability-aware rendering, navigation, searching, copying, and non-destructive behavior.

## 4. Verification and documentation

- [x] 4.1 Document the tmux browser, retained history behavior, initial read-only scope, and psmux capability degradation.
- [x] 4.2 Run focused server and web tests, the full test suite, typecheck, build, and strict OpenSpec validation.
- [ ] 4.3 Manually verify an ithyno-managed tmux session can switch windows/panes and inspect history without restarting the Manager.
