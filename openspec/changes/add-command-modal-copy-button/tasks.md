## 1. UI: copy button

- [x] 1.1 Add an icon-only button in the CommandModal preview area's top-right corner
- [x] 1.2 Inline clipboard SVG glyph; `aria-label="Copy command"` + `title="Copy command"`
- [x] 1.3 CSS: absolutely positioned within the preview container, small padding, hover state

## 2. Behavior: copy action

- [x] 2.1 On click, compute the current preview string by calling the modal's `build(input, mode)` (whatever the Send button would send)
- [x] 2.2 `await navigator.clipboard.writeText(text)` — no fallback needed (localhost + HTTPS-equivalent context via file://; the Clipboard API is available)
- [x] 2.3 On success: swap icon to a check for 1200ms then revert (local timer state)
- [x] 2.4 On rejection: `pushToast("error", "Copy failed — clipboard permission not granted")`

## 3. Keyboard: Cmd+C when no selection

- [x] 3.1 Modal-scoped keydown listener: `(e.metaKey || e.ctrlKey) && e.key === "c"`
- [x] 3.2 Only fire copy if `window.getSelection()?.toString()` is empty (respect the user's active selection if any)
- [x] 3.3 Same success/failure flow as the click handler

## 4. Spec delta

- [x] 4.1 `openspec/changes/add-command-modal-copy-button/specs/dashboard/spec.md`: MODIFIED requirement covering the copy affordance on CommandModal

## 5. Verification

- [x] 5.1 Open the CommandModal (any Kanban action) → copy button visible in top-right
- [x] 5.2 Click copy → icon flips to check for ~1s → clipboard contains the preview string exactly (paste elsewhere to verify)
- [x] 5.3 Cmd+C in the modal with no text selected copies the preview (same flow as click)
- [x] 5.4 Cmd+C with a partial selection copies the SELECTED text (native browser behavior, not our handler)
- [x] 5.5 Deny clipboard permission (browser DevTools → block clipboard) → click copy → error toast appears; no state left inconsistent
