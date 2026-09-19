## Worked

- Sending `ithyno:init-complete` before the iframe navigates away is clean: the
  extension gets the signal, the iframe keeps its own transition. No webview reload needed.
- PATH key-casing fix is a one-liner: `Object.keys(env).find(...)`.

## Surprises

- The `?vscode=1` flag was missing from `renderOnboardingHtml` even after
  `fix-vsix-onboarding-theme` added the theme bridge script — the bridge sends the
  message but the React app never subscribed because `isVsCodeShell()` was false.
- Windows `process.env` spreads keys with their original casing (`Path`, not `PATH`),
  causing the augmented entry to shadow nothing and the original full PATH to persist
  under a different key name.
- `NoProjectDecisionPanel` used `channel=browser` hardcoded, bypassing all VS Code
  messaging. The bug was invisible on non-Windows platforms because PATH was fine there.

## Differently

- The `fix-vsix-onboarding-theme` archive should have included both the bridge script
  AND the `?vscode=1` param — they are two halves of the same fix.

## Follow-ups

- Consider a shared test that checks `renderOnboardingHtml` produces an iframe URL
  with `?vscode=1`.
