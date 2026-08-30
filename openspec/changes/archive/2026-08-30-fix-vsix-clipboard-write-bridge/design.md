## Context

The dashboard is rendered inside a nested iframe in the VS Code webview. The
existing clipboard bridge supports reads for paste, but copy controls still
call `navigator.clipboard.writeText()` inside the iframe. VS Code webview
security can reject that call even when initiated by a user gesture.

## Goals / Non-Goals

**Goals:**

- Provide reliable copy behavior for every dashboard copy control in the VSIX.
- Keep the existing browser and Electron behavior unchanged.
- Return an explicit result so the UI can show the existing success or failure
  feedback.

**Non-Goals:**

- No server API, authentication, or permission-policy changes.
- No clipboard access outside an explicit user-initiated copy action.

## Decisions

- Add a request/response message pair for clipboard writes, mirroring the
  existing read bridge. The iframe posts the text and a request id to its
  parent; the parent forwards it to the Extension Host; the host calls
  `vscode.env.clipboard.writeText()` and returns success or an error.
- Detect the VS Code channel in the dashboard and use the bridge only there.
  Browser and Electron continue using `navigator.clipboard.writeText()`.
- Correlate responses by request id and ignore stale responses, preventing a
  delayed write result from updating a later copy request.

## Risks / Trade-offs

- [Clipboard access can still be denied by the host] → propagate the failure
  response and keep the existing user-visible error toast.
- [A disposed webview may receive a late response] → validate request ids and
  tolerate failed postMessage delivery.

## Migration Plan

No migration is required. Rebuild and reinstall the VSIX; existing dashboard
copy controls automatically use the new bridge.
