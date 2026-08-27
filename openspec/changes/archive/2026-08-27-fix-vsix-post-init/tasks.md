## 1. Fix isVsCodeShell detection in onboarding iframe

- [x] 1.1 Add `url.searchParams.set("vscode", "1")` to `renderOnboardingHtml` iframe URL
- [x] 1.2 Add `useAppliedTheme()` call to `OnboardingProject` component

## 2. Auto-launch terminal after initialization

- [x] 2.1 In `OnboardingProject`, send `{type: "ithyno:init-complete"}` to `window.parent` on "Open Project" click
- [x] 2.2 In `renderWebviewHtml` bridge, forward `ithyno:init-complete` to extension host via `vscode.postMessage`
- [x] 2.3 In `extension.ts` main panel message handler, handle `ithyno:init-complete` → auto-launch terminal if `agents.yaml` exists

## 3. Fix PATH key casing on Windows

- [x] 3.1 In `buildServerEnv()`, find the actual PATH key name with `Object.keys(env).find(k => k.toLowerCase() === "path")` and use it consistently
