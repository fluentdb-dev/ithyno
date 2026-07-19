---
tags: [feature/init, area/electron, area/ui]
---

# New Project onboarding window + openspec init auto-chain

## Why

`add-electron-new-project-flow` (2026-07-19 archived) landed File →
New Project… — but manual verify surfaced a UX gap: `runInit` only
scaffolds ithyno-side files (`CLAUDE.md`, `.claude/skills/`,
`agents.yaml.example`, `docs/`, `.gitignore`, `.git/`). The
`openspec/` directory and the `/opsx:*` slash commands come from a
**separate** `openspec init` invocation. Without them, Ithyno's
window shows "No OpenSpec project found" and the user has to switch
to a terminal, paste the `npx -y -p @fission-ai/openspec@latest
openspec init <target> --tools claude` line from the success
dialog, and re-open the project. **Electron alone cannot complete
the initialization.**

This change closes the gap by:

1. **Auto-chaining `openspec init` after `runInit`** in the Electron
   New Project flow.
2. **Introducing an onboarding window** that opens as soon as the
   user picks a folder — a small, purpose-built window that shows
   the initialization steps, their status, and the live stdout of
   each subprocess. The user sees exactly what is happening and how
   long it will take.
3. **Auto-switching the main window** to the new project after the
   onboarding window reports success — no manual "Open Project"
   step needed.

`openspec init` takes 10–30 seconds on first run (npx package
download) and 1–3 seconds subsequently (npx cache warm). A hidden
progress state during that window is unacceptable — hence the
dedicated onboarding page.

## What Changes

### 1. Main-process orchestration: `runNewProjectChain`

New helper in `electron/src/new-project.ts`:

```ts
type Step = 'scaffold' | 'openspec-init';
type ChainEvent =
  | { type: 'step-start'; step: Step }
  | { type: 'log'; step: Step; line: string; stream: 'stdout' | 'stderr' }
  | { type: 'step-done'; step: Step }
  | { type: 'complete'; target: string }
  | { type: 'error'; step: Step; message: string };

async function runNewProjectChain(
  target: string,
  onEvent: (e: ChainEvent) => void,
): Promise<{ ok: boolean; target: string }>;
```

The chain runs two sequential steps:

1. **`scaffold`** — call the existing `runInit({ targetDir: target,
   autoCreateDir: true, autoGitInit: true, quiet: true, log: line
   => onEvent({ type: 'log', step: 'scaffold', line, stream:
   'stdout' }) })`. `runInit`'s `log` parameter already exists; we
   pipe each line through as an event.
2. **`openspec-init`** — `child_process.spawn('npx', ['-y', '-p',
   '@fission-ai/openspec@latest', 'openspec', 'init', target,
   '--tools', 'claude'])` with `cwd: target`. Every stdout/stderr
   chunk becomes a `log` event.

On any step failure, emit `{ type: 'error', step, message }` and
resolve with `{ ok: false }`. Do NOT throw — the onboarding window
displays the error and lets the user close the window without
switching.

### 2. Onboarding window (`electron/src/onboarding-window.ts` +
`electron/assets/onboarding.html`)

A dedicated 640×480 BrowserWindow that loads a static HTML file
(`electron/assets/onboarding.html`). No React, no bundler — plain
HTML + CSS + a small `<script>` that listens on `window.electronAPI`
(exposed via a new preload `onboarding-preload.ts`).

Layout:

```
┌────────────────────────────────────────┐
│  Setting up ithyno project             │
│  <target-path>                          │
├────────────────────────────────────────┤
│  [○] Scaffold ithyno files             │
│  [○] Install OpenSpec                  │
│                                         │
│  ▼ Log                                  │
│  ┌──────────────────────────────────┐  │
│  │  create:   .gitignore            │  │
│  │  create:   CLAUDE.md             │  │
│  │  - Creating OpenSpec structure…  │  │
│  │  ✔  OpenSpec structure created   │  │
│  └──────────────────────────────────┘  │
│                                         │
│  [Close]              [Open Project]   │
└────────────────────────────────────────┘
```

- Steps show `○` (pending), `⏵` (in progress, animated), `✓` (done),
  or `✗` (failed).
- Log pane auto-scrolls to bottom on new lines, ~200 line ring
  buffer.
- "Open Project" button disabled until `type: 'complete'` arrives;
  enabling triggers `switchProject(target)` in main + closes the
  onboarding window.
- "Close" (always enabled) closes without switching. On error, the
  step icon turns red and Close is the only sensible action.

The onboarding window is modal-ish (parent = mainWindow) but
NON-blocking — the main window remains interactive. Killing the
onboarding window mid-flow does NOT kill the subprocess (the chain
runs to completion in main-process); progress events after a closed
window are simply dropped.

### 3. Menu handler rewire

Instead of `runInit` + `dialog.showMessageBox` + `switchProject`
inline, `onNewProject` now:

1. `pickNewProjectDialog` (unchanged) → target
2. `openOnboardingWindow(target)` — creates the window, wires the
   IPC bridge, kicks off `runNewProjectChain`
3. Returns immediately — no `await`. The window drives itself.

### 4. What this change does NOT touch

- **`runInit` implementation** in `bin/init.js` — untouched. The
  `log` callback already exists; we just consume it.
- **`POST /api/init` endpoint** — untouched. Browser mode continues
  to use it (with the manual "Next steps" panel). Bringing the
  onboarding flow to browser mode is a separate follow-up.
- **`openspec init` chain in the HTTP endpoint** — NOT added.
  Chaining is Electron-only for now. The HTTP endpoint remains
  minimal.
- **agmsg installer** — untouched. Runs on Electron startup;
  independent of New Project.

## Spec deltas (`electron-shell` capability)

- **MODIFIED** `New Project Menu` — instead of the sync
  runInit+dialog+switch chain landed by `add-electron-new-project-
  flow`, the menu opens a dedicated onboarding window that runs
  the two-step chain (runInit → openspec init) with visible
  progress and a manual "Open Project" gate.

## Impact

- **Affected specs**: `electron-shell` — 1 MODIFIED
- **Affected code**:
  - `electron/src/main.ts`: replace `onNewProject`'s inline chain
    with `openOnboardingWindow` call
  - `electron/src/new-project.ts` (new): `runNewProjectChain`
  - `electron/src/onboarding-window.ts` (new): window lifecycle +
    IPC bridge
  - `electron/src/onboarding-preload.ts` (new): `contextBridge`
    exposure of `openProject()` and `onEvent(handler)`
  - `electron/assets/onboarding.html` (new): the UI
  - `electron/tsconfig.json` / `package.json` `files` if needed to
    include `assets/`
- **Risk**:
  - **npx cold-start latency (10–30 s)** — user impatience risk
    mitigated by the visible step + log. First-launch expectation
    set by the log ("Downloading openspec@1.4.1..." or similar).
  - **Concurrent openspec init runs** — user could open File →
    New Project… twice. Fine: separate onboarding windows,
    separate subprocesses. No global lock needed.
  - **Node process crash mid-chain** — the target dir is left in
    a half-scaffolded state. Documented behavior; user can retry
    with `--force` or delete + start over.
- **Migration**: none.

## Related

- `openspec/changes/archive/2026-07-19-add-electron-new-project-flow/`
  — the flow this change extends.
- `docs/ideas/2026-07-19-init-from-ui.md` — the design conversation.
- `electron/src/agmsg-installer.ts` — reference pattern for
  Electron-native install flow (though agmsg has no progress UI —
  init is instant, unlike openspec init).
