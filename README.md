# ithyno

> Markdown underneath, a progress dashboard on top.
> AI agents read and write raw `.md`; humans work in a browser UI to keep spec-driven development (SDD) legible and clickable.

**ithyno** takes the [OpenSpec](https://github.com/Fission-AI/OpenSpec) directory layout (`openspec/specs/` and `openspec/changes/`) as its **single source of truth**, and layers a **local dashboard** on top of it.

- **No new state store.** Progress lives in `tasks.md` — `- [ ]` becomes `- [x]` — and the UI just visualizes and edits that. Break the tool and you can still edit in any text editor.
- **Human + AI both first-class.** Agents read and write plain `.md`; humans navigate a Kanban / progress tree to see the whole picture.
- **Git is the audit log.** "Who checked off which task, when" shows up as a normal markdown commit diff.

---

## What this repo is

A **working MVP** covering roadmap phases 0–2 (with parts of 3 and 4).

- [`idea.md`](./idea.md) — the original brainstorm and rationale.
- [`docs/architecture.md`](./docs/architecture.md) — architecture, tech choices, data model, and two-way sync design.
- [`docs/roadmap.md`](./docs/roadmap.md) — phased implementation roadmap.

### Quick Start

```bash
# Repo contains a git submodule (fujibee/agmsg for multi-agent workflows).
git clone --recursive <this-repo-url>   # or `git submodule update --init` after clone
npm install

# Development (API on 4321, Vite UI on 5173 — open http://localhost:5173)
npm run dev

# Verification mode: Vite HMR on, server not in watch mode — parallel agents
# survive a client reload. Use this when dogfooding Kanban IN-PROGRESS + Start ▾.
npm run dev:test

# Production-equivalent (build the UI, single-process serve, open the browser)
npm run build
npm start            # = node bin/ithyno.js (shows this repo's own openspec/)

# Point at any OpenSpec-initialized project
node bin/ithyno.js --dir /path/to/your/project --port 4321

# Tests + typecheck
npm test
npm run typecheck
```

### Distribution channels

The same dashboard ships through three entry points — pick whichever fits your editor setup.

| Channel | Audience | How to launch |
|---|---|---|
| **CLI + browser** | Any editor (or none) | `node bin/ithyno.js` → opens your default browser |
| **VS Code extension** | VS Code / Cursor | `npm --workspace=vscode-extension run package` → install the generated `.vsix` via "Install from VSIX" → command palette `ithyno: Show Dashboard` |
| **Electron desktop app** | Vim / JetBrains / Sublime / editor-agnostic | Download the DMG / NSIS / AppImage and launch (see [`electron/README.md`](./electron/README.md) for dev setup) |

All three channels wrap the same `bin/ithyno.js` (Fastify + Vite build). Electron's BrowserWindow just loads the localhost server URL; the VS Code webview panel loads the same URL in an iframe. No implementation branches. VS Code extension details: [`vscode-extension/README.md`](./vscode-extension/README.md).

**agmsg (multi-agent workflows)** — the Electron shell auto-installs [fujibee/agmsg](https://github.com/fujibee/agmsg) on first launch (a modal asks Install / Skip / Never ask; the vendored MIT scripts land at `~/.agents/skills/agmsg/`). CLI and VS Code users install it themselves via `/plugin marketplace add fujibee/agmsg` inside their Claude session when they want the dispatcher's agmsg branch active.

> Implementation note: UI styles are plain CSS (`web/src/styles.css`), not Tailwind. The design intent (utility CSS for fast iteration) is unchanged; the dependency + build surface stays small.

### Building the shells

Every shell wraps the same `bin/ithyno.js` + `web/dist/` output. Rebuild the web bundle first (`npm run build` at the repo root) so the shell picks up your latest UI changes; then package the shell.

**Electron desktop app**

```bash
# Dev launch (compiles electron/src/ and opens the window)
npm run electron:dev

# Package for the current platform's macOS target
npm run electron:package:mac      # → electron/dist/*.dmg + *-mac.zip

# Or explicitly per OS
npm run electron:package:win      # → electron/dist/*.exe (NSIS installer)
npm run electron:package:linux    # → electron/dist/*.AppImage, *.deb
npm run electron:package:all      # all three (requires each toolchain locally)
```

Config lives in `electron/package.json`'s `build:` block; the workspace scripts are thin proxies over `electron-builder`. **Code signing / notarization is not set up** — unsigned builds trigger Gatekeeper on macOS ("cannot be opened because the developer cannot be verified") and SmartScreen on Windows; end users have to right-click → Open (macOS) or bypass SmartScreen (Windows) on first launch. Configure `CSC_LINK` / `APPLE_ID` env vars before running the package step if you want signed output; see [`electron/README.md`](./electron/README.md) for the walkthrough.

**VS Code extension (VSIX)**

```bash
# Build the VSIX from a fresh checkout
npm install
npm --workspace=vscode-extension run package   # → vscode-extension/ithyno.vsix
```

`package` runs three steps in order: TypeScript compile (`build`) → stage the monorepo assets (`prepack:host`, which copies `bin/`, `server/`, `web/dist/`, `templates/` into `vscode-extension/host/` and does a production `npm install` there) → `vsce package` produces the VSIX. On first attempt run `npm run build` at the repo root first so `web/dist/` exists.

**Install** the resulting `ithyno.vsix`: VS Code → Extensions view (⇧⌘X / Ctrl+Shift+X) → `⋯` menu → **Install from VSIX…** → pick the file. Then open a folder that contains an `openspec/` directory and run **ithyno: Show Dashboard** from the Command Palette.

**Development loop** for the extension: open `vscode-extension/` as the VS Code workspace root and press **F5** to launch an Extension Development Host. Run `npm --workspace=vscode-extension run watch` in a background terminal so `tsc` recompiles on save. See [`vscode-extension/README.md`](./vscode-extension/README.md) for extension-side details (webview HTML, server spawner, terminal delegation).

### Embedded terminal (right pane of ChangeDetail)

ChangeDetail embeds a **real shell** via xterm.js. The server spawns a PTY and bridges stdin / stdout to the browser terminal. Running `claude` or `/opsx:apply` inside the terminal edits `tasks.md`, and the **Kanban on the same screen follows the change live**.

**Default shell (per OS):**

| OS | Default |
|---|---|
| macOS / Linux | `$SHELL` (falls back to `/bin/bash`) |
| Windows | `pwsh.exe` if on PATH, otherwise `powershell.exe` |

Override with `ITHYNO_SHELL`. Example:

```bash
# Boot straight into Claude Code
ITHYNO_SHELL=claude npm start
```

**Local-only.** Because the terminal bridges a real shell over WebSocket, the server binds to `127.0.0.1` and `/pty` upgrades are **accepted only from localhost** (non-local connections are dropped). Exposing this remotely is not supported by design.

### Security model (CSRF protection)

Binding to `127.0.0.1` alone does not stop a **malicious page in the user's browser** from firing `fetch("http://localhost:<port>/api/pty/inject", ...)` — the TCP endpoint is local, but the browser Origin is a hostile site. Three layered defenses:

1. **Session token** — 32 hex bytes generated on server boot, embedded in the launch URL (`?token=…`). Every mutating endpoint requires a matching token.
2. **Origin allow-list** — only `http://localhost:<port>` / `http://127.0.0.1:<port>` / `http://[::1]:<port>` / `vscode-webview://*`. The browser cannot forge Origin, so cross-site fetches return 403.
3. **Content-Type check** — anything other than `application/json` is rejected, killing simple `<form>` CSRF.

Each layer stands on its own; one breaking doesn't defeat the others. See `openspec/specs/csrf-protection/spec.md`.

**Environments without a PTY backend.** If the native module (`@homebridge/node-pty-prebuilt-multiarch`) fails to load, the dashboard still boots, `/api/health` reports `terminal.available: false`, and the terminal pane is hidden. Graceful degradation, no crash.

### Notes for Windows / WSL users

If you use Claude Code on Windows, **run the ithyno server and Claude Code in the same environment**.

- ✅ Both in WSL (recommended)
- ✅ Both native Windows
- ❌ One in WSL, one on the Windows side — chokidar's file watching is unreliable across the WSL↔Windows boundary; the Kanban stops tracking Claude's edits.

The PTY uses Windows 10 1809+ **ConPTY**. `@homebridge/node-pty-prebuilt-multiarch` ships prebuilt binaries for common Node versions, so no compile step in most cases; if your Node has no prebuilt, Visual Studio Build Tools are required — or you can just leave the terminal disabled (the PTY-load failure path skips it automatically).

### Dogfooding (developing ithyno with OpenSpec)

This repository is itself developed with **real OpenSpec** (`@fission-ai/openspec`).

- [`openspec/`](./openspec/) at the repo root **is this project's live spec.** `npm start` opens the dashboard against it, so you see your own development work and can tick tasks from the UI.
  - `specs/` — current architectural specs of what's already implemented (`markdown-sync` / `dashboard` / `openspec-parsing`, etc.).
  - `changes/` — active proposals.
- Sample data for demos (fictional project) lives in [`examples/sample-project/openspec/`](./examples/sample-project/). Serve it with `npm run demo`.
- OpenSpec workflow: `npm run openspec -- list` / `npm run openspec -- validate --all`. Kick off a new change with `/opsx:propose` (the `.claude/` skills are wired up).

```bash
npm start                       # shows this repo's own openspec/ (dogfooding)
npm run demo                    # shows the examples/ sample
npm run openspec -- validate --all
```

---

## Concept (in one diagram)

```
            ┌─────────────────────────────────────────────┐
            │                Browser UI                    │
            │   Overview / ChangeDetail / Specs browser    │
            │   ・progress bars ・Kanban ・checkbox edits    │
            └───────────────▲───────────────┬──────────────┘
                    WebSocket (push)   │ REST (toggle)
            ┌───────────────┴───────────────▼──────────────┐
            │              Local server (Node)              │
            │   Markdown parser / line-surgical edits /     │
            │   chokidar file watcher / echo suppression    │
            └───────────────▲───────────────┬──────────────┘
                  watch (AI edits)      │ minimum-diff writes
            ┌───────────────┴───────────────▼──────────────┐
            │  openspec/ (Single Source of Truth, .md)     │
            │  specs/**/spec.md    changes/**/tasks.md ...  │
            └────────────────────▲──────────────────────────┘
                                 │ direct read / write
                          AI agent (Claude / Cursor / …)
```

A human ticks a checkbox in the UI → the server rewrites just the one line in `tasks.md` (`- [ ]` ⇄ `- [x]`) → the diff shows up in git.
An AI edits a file → the file watcher sees it → the UI updates in real time.

Full detail: [`docs/architecture.md`](./docs/architecture.md).

---

## Roadmap status

- ✅ Phase 0: project scaffolding (CLI / Vite / Fastify)
- ✅ Phase 1: read-only dashboard (parser, `GET /api/state`, Overview / Detail / Specs)
- ✅ Phase 2: two-way sync (surgical edits, `expectedText` optimistic locking, chokidar + echo suppression, WebSocket push)
- 🚧 Phase 3/4: SPA fallback and static serving are done; Kanban, "editing…" indicator, and npm publishing are underway or pending.

---

## License

**ithyno uses a split license so that adopting it does NOT taint your project with GPL.**

- **Application code** is licensed under **GPL-3.0-or-later.**
  This covers `server/`, `web/`, `electron/`, `bin/`, `vscode-extension/`, the dev-facing `.claude/skills/ithy-opsx-*/` and `.claude/skills/openspec-*/` directories, and everything else at the repo root not explicitly excepted below. See [`LICENSE`](./LICENSE) for the full text.
- **Files that get copied into user projects** are licensed under the **MIT License.**
  Everything under [`templates/`](./templates/) and [`.claude/skills/openspec-flow/`](./.claude/skills/openspec-flow/) — the files `ithyno init` (or an equivalent copy step) drops into your repo — is MIT. This is a deliberate split: **projects initialized with ithyno's templates and workflow skill do NOT inherit copyleft obligations from ithyno.** You can freely modify, redistribute, or embed these files in a project under any license (proprietary included) without concerning yourself with GPL derivative-work rules. Per-subtree LICENSE files: [`templates/LICENSE`](./templates/LICENSE), [`.claude/skills/openspec-flow/LICENSE`](./.claude/skills/openspec-flow/LICENSE).

For individual files lifted out of those directories, the license attaches per-file via SPDX headers: `<!-- SPDX-License-Identifier: MIT -->` in markdown, `# SPDX-License-Identifier: MIT` in YAML. SKILL.md files declare `license: MIT` inside their frontmatter (an SPDX comment before `---` collides with Claude Code's skill loader).

### What this means in practice

| You want to… | The license you're operating under is… |
|---|---|
| Modify or redistribute the ithyno app itself | GPL-3.0-or-later (share modifications back under GPL) |
| Adopt `templates/CLAUDE.md` / `templates/agents.yaml.example` verbatim in your own project | MIT (do whatever, no obligation flows back to your project) |
| Adopt or fork `.claude/skills/openspec-flow/SKILL.md` in your own project | MIT (same as above) |
| Bundle ithyno as a library into a closed-source product | GPL-3.0-or-later applies — likely not the license you want; consider dual-licensing negotiation |
| Contribute a patch to ithyno itself | GPL-3.0-or-later (implicit under the inbound=outbound convention) |

### Dependency licenses

The runtime dependency tree contains only GPL-3.0-compatible licenses (MIT / ISC / BSD / Apache-2.0 / BlueOak / Python-2.0 / Artistic-2.0 / WTFPL / CC0 / 0BSD). No AGPL, SSPL, BUSL, or proprietary deps. Two `CC-BY` packages (`caniuse-lite`, `spdx-exceptions`) are build-time only and not linked into the shipped artifact.

---

## Status

**Alpha (working MVP).** The dashboard boots, the golden paths work, and the repo is dogfooded on itself — but expect breaking changes, rough edges, and undocumented behavior. Follows the OpenSpec workflow for its own development; see the [`openspec/`](./openspec/) directory for the current specs and in-flight changes.

**No warranty.** ithyno is provided **as-is**, without warranty of any kind. The authors and copyright holders accept **no liability for damages** — direct, indirect, incidental, or consequential — arising from installation, use, or inability to use the software, to the extent permitted by applicable law. Full disclaimers live in [`LICENSE`](./LICENSE) (GPL-3.0-or-later, the "No Warranty" and "Limitation of Liability" sections), [`templates/LICENSE`](./templates/LICENSE), and [`.claude/skills/openspec-flow/LICENSE`](./.claude/skills/openspec-flow/LICENSE) (MIT, the "AS IS" clause).
