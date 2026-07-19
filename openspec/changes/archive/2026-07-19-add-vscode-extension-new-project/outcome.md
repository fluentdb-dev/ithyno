# Outcome — add-vscode-extension-new-project

## ✅ Worked

- **Command Palette entry landed.** `ithyno.newProject` shows up in
  Command Palette immediately after activation. The
  `showOpenDialog` + `showInputBox` two-step accepts both
  "existing folder" and "make subdir" flows.
- **Onboarding UI reused verbatim.** The shared `/onboarding`
  React page already handled `channel=vscode` in
  `onboardingChannel.ts` — only the iframe hop was missing. Added a
  `postToVsCode(msg)` helper that prefers `acquireVsCodeApi()` when
  present, falls back to `window.parent.postMessage(msg, "*")` when
  running inside an iframe. Same code path serves all three
  channels now.
- **Webview panel bridge.** `renderOnboardingHtml(serverUrl,
  target)` mirrors `renderWebviewHtml` shape but filters on
  `onboarding-*` types instead of `pty.*`. Kept as a sibling
  function in the same file to make the two bridges easy to compare.
- **Target validation defense in depth.** The extension checks
  `isValidOnboardingTarget(msg.target)` before invoking
  `vscode.openFolder`: absolute path, parent exists, no `..`
  segments. Even though the webview builds the target from the
  folder picker, the message boundary is treated as untrusted.
- **`vscode.openFolder` reload works.** Panel disposes first (via
  `disposed = true; panel.dispose()`), then `openFolder` invokes
  the window reload. The `panel.onDidDispose` handler runs
  `server.dispose()` synchronously before the extension host dies.
- **Byproduct: session-id smoke verified.** Same test flight
  verified `vscode-terminal-uses-project-session-id` task 5.4 —
  `.ithyno/session-id` gets minted, `claude --session-id <uuid>`
  runs, `--resume <uuid>` works on re-open.

## ⚠️ Surprises

- **VSIX packaging needed a `LICENSE` copy.** The repo root has
  `LICENSE` but vsce expects one next to the package's
  `package.json`. Extended `prepack.mjs` to copy it into
  `vscode-extension/LICENSE` at package time, added to `.gitignore`.
  Small side quest but worth surfacing.
- **`spawnServer` timeout was 5000ms** — VSIX cold start (tsx bundle
  + `bin/ithyno.js` spawn + first HTTP listen) can exceed that on
  a warm machine. Bumped to 20000ms for both the launch-URL sniff
  and the `waitForHealth` poll. Should probably tune this per
  environment (dev vs packaged) but 20s is safe.
- **First re-open failed with "No conversation found"**. Turned out
  Claude Code only persists a session AFTER the user sends the
  first message — mint alone doesn't create a durable record.
  Documented in `docs/user-manual/troubleshooting.md`; not
  addressed at code level in this change.
- **Iframe branch of `onboardingChannel`** required checking
  `window !== window.parent` at runtime because
  `typeof window.acquireVsCodeApi` is only defined in the top-level
  webview. Simple enough once identified but easy to miss.

## 🔁 Differently next time

- **Bumping timeouts should be its own tiny change or bundled
  with the initial `add-vscode-extension` spec.** I folded it into
  this change's impl because it blocked smoke testing, but strictly
  the 20s bump is unrelated to the New Project feature.
- **Prepack + `LICENSE` fix** — same story. Would fit better as
  a hygiene change once and forever.

## 🌱 Follow-ups

- **Post-openFolder auto-open dashboard** — after `vscode.openFolder`
  reloads the window, the user has to manually run
  `ithyno: Show Dashboard`. A workspace-level "open dashboard on
  next activation" flag would close that gap. Not scoped here.
- **Multi-root workspace support** — the extension picks the first
  folder. `showOpenDialog` in a multi-root workspace could ask
  which folder to sit under. Not scoped here.
- **Kill onboarding subprocess on close** — currently, closing the
  onboarding panel mid-`openspec init` leaves `npx` running to
  completion. A `child.kill('SIGTERM')` on `onDidDispose` would
  fix this but requires threading the subprocess handle back from
  `runNewProjectChain` through the SSE bridge.
- **Session-id gap documented but not fixed** — see the
  troubleshooting doc; a shell composition `claude --resume <uuid>
  || claude --session-id <new>` could paper over it but adds
  complexity. Deferred.
