## ✅ What worked

- Copy-pasting the exact `sendTheme()` + MutationObserver + `vscode:get-theme` handler
  pattern from `renderWebviewHtml` required zero adaptation — both shells have identical
  iframe structure and the pattern is self-contained.

## ⚠️ What surprised us

- The two shells (`renderWebviewHtml` / `renderOnboardingHtml`) were written as
  separate functions and diverged silently — one got theme forwarding, the other
  never did. The gap was invisible until a user reported colors staying white.
- A second gap was discovered post-archive: `renderOnboardingHtml` was not
  setting `?vscode=1` on the iframe URL, so `isVsCodeShell()` returned false
  inside the onboarding React page. The theme-bridge messages were sent but
  ignored by `useAppliedTheme`. Fixed (retrofit): added `vscode=1` param to
  the iframe URL and called `useAppliedTheme()` in `OnboardingProject`.

## 🔁 What we'd do differently

- Extract the theme-bridge script fragment into a shared helper so the two
  shells can't diverge again on future additions.

## 🌱 Follow-ups

- Refactor both shells to share a common theme-bridge snippet (separate change).
- The "Client not found" during INITIALIZE on empty folder needs separate investigation.
