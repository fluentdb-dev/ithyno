# Delta: dashboard — Shared onboarding project page

## ADDED Requirements

### Requirement: Onboarding Project Page

The dashboard SHALL expose a React route at `/onboarding` that renders
a shared "new project initialization" experience consumed by all three
channels (Electron via a child BrowserWindow, browser via in-app
navigation, VS Code via a webview panel in a future follow-up).

The route SHALL accept these query parameters:

- **`target`** — required. The absolute path where the new project is
  being created. The page reads it verbatim and passes it to the
  streaming endpoint.
- **`channel`** — optional. One of `electron`, `browser`, `vscode`.
  When absent, the page infers the channel at runtime (checks
  `window.electronAPI` first, then `window.acquireVsCodeApi`, else
  falls through to `browser`). Determines close/open handler routing.

On mount the page SHALL:

1. Read the query params; if `target` is missing or not absolute,
   render an error state ("target required") with a Close button
   only.
2. Open a `fetch` POST against `/api/init/stream` with body
   `{ dir: target, autoCreateDir: true, autoGitInit: true }` and
   `Accept: text/event-stream`. Consume the response body reader
   frame-by-frame and dispatch each parsed `ChainEvent` into local
   state.
3. Render the layout:
   - Header: "Setting up ithyno project" plus the target path (with
     word-wrap for long paths).
   - Step list: `scaffold` (label "Scaffold ithyno files") and
     `openspec-init` (label "Install OpenSpec"). Each step shows an
     icon: `pending` (○), `in-progress` (⏵ animated), `done` (✓),
     `failed` (✗ in red).
   - Log pane: a monospace scrollable region, auto-scrolls to bottom
     on each new line, ring buffer capped at 500 lines. Each line
     shows its `stream` prefix subtly (stderr styled distinctly).
   - Buttons row:
     - **Close** — always enabled. Behavior depends on channel:
       - `electron`: send `onboarding-close` IPC to main; the
         BrowserWindow closes and the main window is untouched.
       - `browser`: `history.back()` OR `router.navigate('/')`
         depending on how the page was reached.
       - `vscode`: post message `{ type: 'onboarding-close' }` to
         the extension host; the webview panel is disposed.
     - **Open Project** — disabled until `complete` arrives.
       Behavior depends on channel:
       - `electron`: send `onboarding-open` IPC with the target; the
         main process closes the window and calls `switchProject`.
       - `browser`: navigate to `/` with `?dir=<target>` so the
         store re-scans and the Kanban shows the new project (the
         server also picks up the new PROJECT_ROOT via a page
         reload or a store-refresh cascade — this detail is
         implementation but the observable behavior is "the main
         app now shows the new project").
       - `vscode`: post message `{ type: 'onboarding-open',
         target }` to the extension host; the extension calls
         `vscode.commands.executeCommand('vscode.openFolder',
         Uri.file(target))`.

The page SHALL NOT block on `runInit` succeeding to render the shell
— the layout appears immediately with all steps in `pending`, then
transitions as SSE events arrive. This prevents a blank window
during the ~200ms `fetch` open time.

The page SHALL be resilient to a mid-stream connection loss (e.g.
server restart, network hiccup): if the reader throws, the current
step's icon transitions to `failed` with an inline message
("Connection lost — try again"), Open Project stays disabled, and
Close remains available. No auto-retry in this iteration.

Log lines flagged `stream: 'stderr'` SHALL be visually distinct
(e.g. red-tinted prefix) without breaking the ring-buffer behavior.

The page has NO ability to cancel the underlying chain — the
subprocess runs to completion server-side regardless of what the
page does. Close simply detaches the page's subscription; the target
directory reflects whatever the chain wrote before or after the
disconnect.

#### Scenario: route mounted with a valid target
- **GIVEN** the user navigates to `/onboarding?target=/tmp/new-proj&channel=electron`
- **WHEN** the page mounts
- **THEN** it fetches `POST /api/init/stream` with `{ dir: "/tmp/new-proj", autoCreateDir: true, autoGitInit: true }` and renders the header, both steps as `pending`, an empty log pane, and both buttons (Close enabled, Open Project disabled)

#### Scenario: SSE events transition step icons
- **GIVEN** the page is subscribed to the stream
- **WHEN** the server emits `step-start scaffold`, then several `log scaffold`, then `step-done scaffold`
- **THEN** the `scaffold` step icon transitions `pending` → `in-progress` → `done` and each log line appears in the log pane in order

#### Scenario: complete event enables Open Project
- **GIVEN** both steps have completed successfully
- **WHEN** the server emits `type: complete` with the target path
- **THEN** the Open Project button becomes enabled; clicking it invokes the channel-specific handler and closes/navigates as documented

#### Scenario: error event disables Open Project
- **GIVEN** the chain fails during `openspec-init`
- **WHEN** the server emits `type: error step: openspec-init message: ...`
- **THEN** the `openspec-init` step icon shows `failed` in red, the error message appears in the log pane, Open Project remains disabled, Close remains enabled

#### Scenario: missing target renders error state
- **GIVEN** the user navigates to `/onboarding` with no `target` query param
- **WHEN** the page mounts
- **THEN** it renders "target required" and a Close button only, and does NOT open a stream

#### Scenario: connection loss transitions to failed
- **GIVEN** the page is mid-stream on `openspec-init`
- **WHEN** the `fetch` reader throws (server restart, network drop)
- **THEN** the current step icon transitions to `failed`, an inline "Connection lost" message shows in the log pane, Open Project stays disabled, Close is the only usable button

#### Scenario: channel inference when query param absent
- **GIVEN** the page mounts at `/onboarding?target=/tmp/foo` with no `channel` param
- **AND** `window.electronAPI` is defined
- **WHEN** the page evaluates channel routing
- **THEN** it treats the channel as `electron` for Close and Open Project handlers

#### Scenario: browser-mode Open Project navigates
- **GIVEN** the page loaded with `?channel=browser` (or inferred it)
- **WHEN** the user clicks Open Project
- **THEN** the app navigates to `/?dir=<target>` and the store re-fetches such that the Kanban shows the new project
