# Outcome — add-command-modal-copy-button

## ✅ Worked

- Copy button as top-right absolute inside `.modal-preview` (with the
  parent switched to `position: relative`), sharing the same
  CommandModal component so all 4 flows (apply / archive / merge /
  discard) get it in one edit.
- Icon swap via a single `copied` boolean + 1200ms `setTimeout`
  cleanup — kept the state machine tiny.
- Cmd+C listener gated on `window.getSelection()?.toString()` being
  empty so the browser's native selection-copy is preserved.
- Reused the existing `pushToast("error", ...)` for the clipboard-
  denied path — no new toast plumbing needed.

## ⚠️ Surprises

- Testing revealed the button was not appearing in the running
  Electron app even after the source edit landed. Root cause chain:
  (a) Electron always spawns the server in production-static mode
  (`server-spawner.ts` deletes `ITHYNO_DEV`), so it serves
  `web/dist/` off disk; (b) `web/dist/` was stale from an earlier
  build. Fix was `npm run build` + reload the Electron window.
  Worth remembering when landing web-only changes for Electron
  users — no HMR path.
- A separate red herring: `.worktrees/add-changedetail-merge-discard/`
  had an older `CommandModal.tsx` copy without the button. When the
  user ran `npm run dev` from within that worktree, they saw the
  pre-copy-button UI. The worktree is on its own branch, so the
  fix was not to patch it — the fix was to run dev from main (or
  wait for the worktree to merge and pull the button change).
- An unrelated stale process (PID 83103, `.worktrees/add-vscode-
  extension/vscode-extension/host/server/index.ts`, 36 hours old)
  was holding port 4321. `add-vscode-extension` had been archived
  but the extension host it spawned kept running. Not caused by
  this change, but surfaced during the debug — noting here so the
  next occurrence is faster to diagnose.
- Initial `top: 22px` sat slightly too high visually; adjusted to
  `28px` after user feedback. The label span above the `<pre>` is
  the reference — margin-tuning by eye was faster than measuring.

## 🔁 Differently

- Nothing on the code side would land differently.
- Documentation-wise: the "web edit + Electron doesn't reflect it"
  gotcha deserves a one-liner in the Electron README or CLAUDE.md
  useful-commands section — e.g. "web changes require `npm run
  build` + reload for the Electron shell; `npm run dev` HMR only
  applies to the browser dev flow."

## 🌱 Follow-ups

- Copy button on the Kanban card itself for the change id (proposed
  as out-of-scope here). Would compose with this same
  `pushToast`/icon-swap pattern.
- Copy history / clipboard manager was called out as a distinct
  feature. Not urgent, but if a future flow chains several
  archives / merges the paste-elsewhere workflow gets repetitive.
- Consider a small unit test for the Cmd+C-with-selection branch —
  the browser-native path is easy to accidentally break with a
  future keyboard-shortcut refactor. Nothing today, but flagging.
