# Tasks — add-new-project-onboarding-window

## 1. PENDING annotation

- [x] 1.1 Insert PENDING MODIFIED annotation to
  `openspec/specs/electron-shell/spec.md` § New Project Menu

## 2. Spec delta

- [x] 2.1 Write MODIFIED `New Project Menu` (onboarding window
  replaces the inline dialog chain, adds openspec init step)

## 3. Main-process chain

- [x] 3.1 Create `electron/src/new-project.ts` exporting
  `runNewProjectChain(target, onEvent)`
- [x] 3.2 Step 1: wrap the existing `runInit` import + call, plumb
  its `log` callback into `onEvent` as `type: log`
- [x] 3.3 Step 2: `child_process.spawn('npx', ['-y', '-p',
  '@fission-ai/openspec@latest', 'openspec', 'init', target,
  '--tools', 'claude'], { cwd: target })`
- [x] 3.4 Stream stdout / stderr as `type: log` events (line-split)
- [x] 3.5 Emit `step-start` / `step-done` / `complete` / `error`
- [x] 3.6 Never throw — return `{ ok, target }`

## 4. Onboarding window

- [x] 4.1 Create `electron/assets/onboarding.html` — plain HTML +
  CSS, no bundler
- [x] 4.2 Create `electron/src/onboarding-preload.ts` — expose
  `onEvent` + `openProject` + `close` via `contextBridge`
- [x] 4.3 Create `electron/src/onboarding-window.ts` — window
  lifecycle helper (`openOnboardingWindow(target, mainWin)`)
- [x] 4.4 Wire IPC: `onboarding-event` channel main → renderer;
  `onboarding-open` / `onboarding-close` renderer → main
- [x] 4.5 On `onboarding-open`: close onboarding window, call
  `switchProject(target)` in main

## 5. Menu rewire

- [x] 5.1 In `electron/src/main.ts`, replace the inline
  `onNewProjectImpl` body with a call to
  `openOnboardingWindow(picked, mainWindow)`
- [x] 5.2 Remove the intermediate `dialog.showMessageBox` call
  (superseded by the onboarding window's own "Open Project"
  button)
- [x] 5.3 Keep `try/catch` outer around the whole flow so any
  main-process failure surfaces via `showErrorBox`

## 6. Packaging

- [x] 6.1 Update `electron/tsconfig.json` if `assets/` needs
  inclusion — NOT NEEDED, no static HTML/CSS files; the page is
  loaded from the running server URL, not from a bundled file
- [x] 6.2 Verify `electron-builder` `extraResources` covers the
  compiled `onboarding-preload.js` — outputs to `electron/out/`,
  which is already covered by the existing extraResources rule for
  the electron workspace

## 7. Verify

- [x] 7.1 `openspec validate add-new-project-onboarding-window
  --strict` VALID
- [x] 7.2 `npm --workspace=electron run build && npm test && npm
  run typecheck && npm run build` clean
- [x] 7.3 Manual (dev): File → New Project… → pick a fresh path →
  onboarding window opens → both steps progress → "Open Project"
  becomes enabled → click → main window switches → target has
  `openspec/` directory + `.claude/skills/openspec-*` skills
- [ ] 7.4 Manual: same, but pick an already-scaffolded folder →
  step 1 skips or completes fast, step 2 detects existing
  `openspec/config.yaml`, log shows accordingly, "Open Project"
  becomes enabled
  — **pending user-side verify**
- [ ] 7.5 Manual (error path): pick a directory the process can't
  write to → step 1 fails → error icon shown, "Open Project"
  disabled, "Close" only
  — **pending user-side verify**

## 8. Post-impl

- [x] 8.1 `outcome.md`
- [x] 8.2 Update `docs/ideas/2026-07-19-init-from-ui.md`
  frontmatter's `promoted_to` with this change's archive path
- [ ] 8.3 `/ithy-opsx:archive add-new-project-onboarding-window`
