# Tasks — add-new-project-onboarding-window

## 1. PENDING annotation

- [x] 1.1 Insert PENDING MODIFIED annotation to
  `openspec/specs/electron-shell/spec.md` § New Project Menu

## 2. Spec delta

- [x] 2.1 Write MODIFIED `New Project Menu` (onboarding window
  replaces the inline dialog chain, adds openspec init step)

## 3. Main-process chain

- [ ] 3.1 Create `electron/src/new-project.ts` exporting
  `runNewProjectChain(target, onEvent)`
- [ ] 3.2 Step 1: wrap the existing `runInit` import + call, plumb
  its `log` callback into `onEvent` as `type: log`
- [ ] 3.3 Step 2: `child_process.spawn('npx', ['-y', '-p',
  '@fission-ai/openspec@latest', 'openspec', 'init', target,
  '--tools', 'claude'], { cwd: target })`
- [ ] 3.4 Stream stdout / stderr as `type: log` events (line-split)
- [ ] 3.5 Emit `step-start` / `step-done` / `complete` / `error`
- [ ] 3.6 Never throw — return `{ ok, target }`

## 4. Onboarding window

- [ ] 4.1 Create `electron/assets/onboarding.html` — plain HTML +
  CSS, no bundler
- [ ] 4.2 Create `electron/src/onboarding-preload.ts` — expose
  `onEvent` + `openProject` + `close` via `contextBridge`
- [ ] 4.3 Create `electron/src/onboarding-window.ts` — window
  lifecycle helper (`openOnboardingWindow(target, mainWin)`)
- [ ] 4.4 Wire IPC: `onboarding-event` channel main → renderer;
  `onboarding-open` / `onboarding-close` renderer → main
- [ ] 4.5 On `onboarding-open`: close onboarding window, call
  `switchProject(target)` in main

## 5. Menu rewire

- [ ] 5.1 In `electron/src/main.ts`, replace the inline
  `onNewProjectImpl` body with a call to
  `openOnboardingWindow(picked, mainWindow)`
- [ ] 5.2 Remove the intermediate `dialog.showMessageBox` call
  (superseded by the onboarding window's own "Open Project"
  button)
- [ ] 5.3 Keep `try/catch` outer around the whole flow so any
  main-process failure surfaces via `showErrorBox`

## 6. Packaging

- [ ] 6.1 Update `electron/tsconfig.json` if `assets/` needs
  inclusion (probably not — HTML/CSS are loaded at runtime, not
  compiled)
- [ ] 6.2 Verify `electron-builder` `extraResources` covers
  `assets/onboarding.html` and the compiled preload

## 7. Verify

- [ ] 7.1 `openspec validate add-new-project-onboarding-window
  --strict` VALID
- [ ] 7.2 `npm --workspace=electron run build && npm test && npm
  run typecheck && npm run build` clean
- [ ] 7.3 Manual (dev): File → New Project… → pick a fresh path →
  onboarding window opens → both steps progress → "Open Project"
  becomes enabled → click → main window switches → target has
  `openspec/` directory + `.claude/skills/openspec-*` skills
- [ ] 7.4 Manual: same, but pick an already-scaffolded folder →
  step 1 skips or completes fast, step 2 detects existing
  `openspec/config.yaml`, log shows accordingly, "Open Project"
  becomes enabled
- [ ] 7.5 Manual (error path): pick a directory the process can't
  write to → step 1 fails → error icon shown, "Open Project"
  disabled, "Close" only

## 8. Post-impl

- [ ] 8.1 `outcome.md`
- [ ] 8.2 Update `docs/ideas/2026-07-19-init-from-ui.md`
  frontmatter's `promoted_to` with this change's archive path
- [ ] 8.3 `/ithy-opsx:archive add-new-project-onboarding-window`
