# Outcome: add-csrf-protection

## ✅ Worked

- **Three-layer defense composed cleanly.** Session token + Origin allow-list
  + Content-Type check landed as three independent Fastify hooks on
  `server/index.ts`, with `server/util/auth.ts` owning the pure predicates
  (`verifyToken` / `buildOriginAllowList` / `isOriginAllowed`). Each layer
  can fail closed without pulling in the others — the tests exercise them
  in isolation.
- **`vscode-webview://` prefix was already the right call.** Baked into
  `buildOriginAllowList` from day one; when `add-vscode-extension` shipped
  months later, the webview's requests passed the Origin gate without any
  further wiring. Verify 9.5 (VS Code extension token round-trip) went
  green immediately in that follow-up archive.
- **URL bootstrap stays boring.** The server prints the launch URL with
  `?token=<hex>` on stdout; every entry point (CLI, Electron, VS Code
  extension) just parses that line with the same regex and hands the URL
  to the shell. No IPC, no keychain, no config file — the token lives
  in-memory per process.
- **Constant-time token comparison.** `verifyToken` uses `timingSafeEqual`
  on equal-length buffers, with a dummy compare for the length-mismatch
  branch. Unit tested for both correct and incorrect lengths.

## ⚠️ Surprises

- **`fetch("http://localhost:<port>/api/...")` from a cross-site page
  really is TCP-local.** The `isLocal` check that predates this change
  passed for such requests — the reason we needed the Origin layer in the
  first place. This was the motivating case in the proposal; verifying it
  by hand (tab A pinned to a random unrelated site, tab B running the
  dashboard) made the risk feel concrete.
- **Empty Origin has to be allowed at the Origin layer.** Same-origin
  fetches from the app itself (and some `undici`/curl calls) send no
  `Origin` header at all; blocking them there would break our own
  legitimate flows. The token check still gates the request end-to-end,
  so the composed defense stays sound.
- **`vscode-webview://` is a prefix match, not exact.** VS Code stamps a
  random opaque suffix per session (something like
  `vscode-webview://<opaque-id>/index.html`), so exact-match rejects
  everything. The allow-list's `prefixes: string[]` slot handles this
  cleanly without special-casing.

## 🔁 Differently

- Considered a rotating token (regenerate every N minutes). Rejected as
  premature — the token is per-process, so a server restart already
  invalidates it. Rotation buys defense against a token *leak* mid-run,
  which is not a threat model we're targeting today (the token never
  leaves localhost + the extension). Deferred to a follow-up if a
  concrete leak vector shows up.
- The proposal drafted a per-endpoint opt-in for Content-Type checks;
  landed instead as a global default (rejects non-JSON on mutations) with
  a documented exception for the WS upgrades. Simpler, and consistent
  with how Jupyter / Streamlit handle the same shape.

## 🌱 Follow-ups

- **Token rotation on long-running sessions** — if a user leaves the
  dashboard open for days, rotate the token silently and update the URL
  in the browser via `history.replaceState`. Not needed today; note it
  down for the day someone reports "my long-running tab suddenly hit
  401".
- **Session-expired UX polish** — the current banner ("Session expired —
  reopen from the CLI") is honest but blunt. Could offer a one-click
  "Copy launch command" button that pastes the exact `openspec-ui …`
  invocation.
- **CSP header on the HTML shell** — belt-and-suspenders against XSS.
  The current setup would already contain the blast radius because the
  session token isn't in the DOM (only the URL), but a Content-Security-
  Policy header is cheap insurance.
