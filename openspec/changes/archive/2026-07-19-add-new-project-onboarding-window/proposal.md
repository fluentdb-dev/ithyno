---
tags: [feature/init, area/electron, area/server, area/ui]
---

# Onboarding page (shared React) + openspec init auto-chain across channels

## Why

`add-electron-new-project-flow` (2026-07-19 archived) landed File →
New Project… — but manual verify surfaced a UX gap: `runInit` only
scaffolds ithyno-side files (`CLAUDE.md`, `.claude/skills/`,
`agents.yaml.example`, `docs/`, `.gitignore`, `.git/`). The
`openspec/` directory and the `/opsx:*` slash commands come from a
**separate** `openspec init` invocation. Without them, Ithyno's
window shows "No OpenSpec project found" and the user has to switch
to a terminal, paste the `npx -y -p @fission-ai/openspec@latest
openspec init <target> --tools claude` line from the success dialog,
and re-open the project. **Electron alone cannot complete the
initialization.**

The first draft of this change scoped a fix Electron-only (a
dedicated onboarding BrowserWindow that runs `runInit` then
`openspec init`). A design pass surfaced that the same problem
exists in the browser channel (Settings' NewProjectSection stops at
"Next steps" text) and will exist for the VS Code extension. The
onboarding UI itself is channel-agnostic — a target path plus a step
list plus a log pane — so **the fix should be shared**, with each
channel differing only in how it opens the container that shows
the page.

## What Changes

### 1. Shared backbone: `runNewProjectChain`

Extract the two-step chain to `bin/new-project-chain.js` (mirror of
`bin/init.js`'s stateless-orchestrator shape):

```ts
type Step = 'scaffold' | 'openspec-init';
type ChainEvent =
  | { type: 'step-start'; step: Step }
  | { type: 'log'; step: Step; line: string; stream: 'stdout' | 'stderr' }
  | { type: 'step-done'; step: Step }
  | { type: 'complete'; target: string }
  | { type: 'error'; step: Step; message: string };

export async function runNewProjectChain(
  target: string,
  onEvent: (e: ChainEvent) => void,
): Promise<{ ok: boolean; target: string }>;
```

- **`scaffold`** — call the existing `runInit({ targetDir: target,
  autoCreateDir: true, autoGitInit: true, quiet: true, log })` and
  forward its log lines as `log` events.
- **`openspec-init`** — `child_process.spawn('npx', ['-y', '-p',
  '@fission-ai/openspec@latest', 'openspec', 'init', target,
  '--tools', 'claude'], { cwd: target })`. Stdout/stderr chunks are
  line-split and emitted as `log` events.

Never throws. Failures resolve `{ ok: false }` after emitting
`error`.

### 2. Streaming HTTP endpoint: `POST /api/init/stream`

New endpoint that authenticates the same way as `POST /api/init` and
`POST /api/git/init` (existing token check + `isLocal`), then invokes
`runNewProjectChain` and streams events as **Server-Sent Events**
(text/event-stream) — each `ChainEvent` is one SSE frame. Body shape
is the same as `POST /api/init` (validates `dir` absolute, applies
`force` / `skipGitignore` if present).

The synchronous `POST /api/init` endpoint remains available and
unchanged for callers that don't want streaming (Electron using the
shared function directly bypasses HTTP entirely).

### 3. Shared onboarding page: `/onboarding?target=<path>`

New React route at `web/src/pages/OnboardingProject.tsx`:

- Reads `target` from the query string.
- On mount, opens an `EventSource` against `POST /api/init/stream`
  (using `fetch` with `Accept: text/event-stream`, or the browser's
  SSE API depending on POST support — falling back to a WebSocket
  `init-progress` broadcast if SSE-with-POST is awkward). Details
  below.
- Renders:
  - Header: "Setting up ithyno project" + target path
  - Step list: `scaffold`, `openspec-init` — each with an icon
    (`pending` / `in-progress` / `done` / `failed`) and a label.
  - Log pane: auto-scroll, ring buffer capped at ~500 lines.
  - **"Close"** — always enabled. Behavior differs by channel (see
    below).
  - **"Open Project"** — disabled until `complete`. Behavior differs
    by channel.

The page posts a channel signal at mount so it knows how to close:
either via URL param (`?channel=electron`) OR via a runtime detection
already present in `web/src/runtime` (checks `window.electronAPI`).

### 4. Channel-specific containers

Each channel opens `/onboarding?target=<path>&channel=<c>` in its own
container.

| channel | container | on "Open Project" | on "Close" |
| --- | --- | --- | --- |
| **Electron** | small BrowserWindow (parent = main), `loadURL(server + path)` | IPC `onboarding-open` → main `switchProject(target)` + close window | close window; main untouched |
| **Browser** | React Router navigate to `/onboarding` (full page in the current window) | React Router navigate to root with `?dir=<target>` so the store re-scans | navigate back to previous route |
| **VS Code** | `vscode.window.createWebviewPanel` loading the same URL | webview close + `vscode.commands.executeCommand('vscode.openFolder', ...)` | dispose the panel |

The React page dispatches to the right handler via a small
`onboardingApi` module that checks `window.electronAPI` /
`window.vscode` / falls through to the browser default.

### 5. Menu / settings rewire

- **Electron `onNewProject`**: after `pickNewProjectDialog`, open a
  new BrowserWindow that loads `server + '/onboarding?target=<path>
  &channel=electron'`. Register the IPC bridge for "Open Project".
  Remove the previous inline dialog chain.
- **Browser `NewProjectSection`** (Settings tab): instead of
  awaiting `initProject` synchronously and showing the "Next steps"
  panel, on Submit navigate to `/onboarding?target=<parent>/<name>
  &channel=browser`. The page drives the rest.
- **VS Code**: separate follow-up (`add-vscode-new-project-command`)
  will call `vscode.window.createWebviewPanel` with the same URL.
  This propose lays the groundwork; the VS Code side is not
  implemented here.

### 6. What this change does NOT touch

- **`runInit` in `bin/init.js`** — untouched. The chain wraps it.
- **`POST /api/init` (non-streaming)** — untouched. Left in place for
  synchronous callers.
- **VS Code extension code** — untouched here. Groundwork only.
- **agmsg installer** — separate concern.

## Spec deltas

- **`electron-shell`** — **MODIFIED** `New Project Menu` (now opens
  the shared onboarding URL in a BrowserWindow instead of running
  the inline runInit + dialog chain).
- **`project-init`** — **MODIFIED** `Init HTTP Endpoint` (adds the
  streaming sibling `POST /api/init/stream` that runs the two-step
  chain and emits SSE events; synchronous endpoint retained).
- **`dashboard`** — **ADDED** `Onboarding Project Page` — the
  `/onboarding` route, its query params, its rendering contract,
  and its channel-aware close/open handlers.

## Impact

- **Affected specs**: `electron-shell` 1 MODIFIED, `project-init` 1
  MODIFIED, `dashboard` 1 ADDED
- **Affected code**:
  - `bin/new-project-chain.js` (new) + `.d.ts`
  - `server/index.ts` (new endpoint + SSE writer)
  - `web/src/api.ts` (`initProjectStream` SSE client)
  - `web/src/pages/OnboardingProject.tsx` (new)
  - `web/src/App.tsx` (add route)
  - `web/src/pages/Settings.tsx` (rewire NewProjectSection Submit)
  - `electron/src/main.ts` (rewire `onNewProject` to load
    onboarding URL in child BrowserWindow)
  - `electron/src/preload.ts` + a new `onboarding-preload.ts` for
    IPC bridge
- **Risk**:
  - **SSE-over-POST browser support** — modern browsers accept
    `fetch` with a streaming body reader, but the classic
    `EventSource` API is GET-only. Client uses `fetch` +
    `response.body.getReader()`. Documented fallback path if
    encountering a browser that mishandles the stream: fall back to
    WS `init-progress` broadcast (already used by other server →
    client streams in Ithyno).
  - **npx cold-start latency (10–30 s)** — the log surface makes it
    visible.
  - **Long-running subprocess if user closes** — mid-chain close
    does NOT kill the subprocess; the chain runs to completion,
    post-close events are dropped. Target dir might be left in
    partial state; documented behavior.
- **Migration**: none.

## Related

- `openspec/changes/archive/2026-07-19-add-electron-new-project-flow/`
- `openspec/changes/archive/2026-07-19-add-init-http-endpoint/`
- `docs/ideas/2026-07-19-init-from-ui.md`
- `electron/src/agmsg-installer.ts` — Electron-native install pattern
  reference.
