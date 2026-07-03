---
tags: [feature/migration, area/docs]
---

# Migrating an existing project to OpenSpec UI

A step-by-step guide for adopting OpenSpec + this dashboard on a project that
already exists. Three stages: install OpenSpec → run the dashboard → optionally
add agent runner.

## Prerequisites

- **Node 18+** is available locally.
- **git 2.5+** (worktree support).
- The target project is **ideally** a git repository. It does not have to
  be one when you open the dashboard — the header's Git chip offers a
  one-click `git init` and the ExecutionPicker's Worktree option is
  disabled with a clear reason until a repo exists. Non-agent use (specs,
  changes, tasks, docs) works without git either way.

## Stage 1 — Initialize OpenSpec in the target project

Use the official CLI; it scaffolds the directory layout and installs the
Claude Code skills.

```bash
cd /path/to/your-project

npx -y -p @fission-ai/openspec@latest openspec init . --tools claude
```

What gets created:

```
your-project/
├── openspec/
│   ├── config.yaml
│   ├── specs/         # current behavior of the system
│   └── changes/       # in-flight proposals
└── .claude/
    ├── commands/opsx/ # /opsx:propose etc.
    └── skills/        # openspec-propose / apply / archive ...
```

## Stage 2 — Run OpenSpec UI against the target

Pick whichever entry point matches how you already work.

| method | command | when |
|---|---|---|
| **Direct** | `node /path/to/openspec-ui/bin/openspec-ui.js --dir /path/to/your-project` | quick trial |
| **devDep install** | `cd your-project && npm install --save-dev /path/to/openspec-ui` | pin to the project |
| **Global link** | `cd openspec-ui && npm link` → `cd your-project && openspec-ui` | call from anywhere |
| **Electron app** | download the DMG / NSIS installer / AppImage and open — pick the project folder on first launch | no editor / non-VS Code editor / prefer a native window |
| **VS Code extension** | build `vscode-extension/openspec-ui.vsix` → **Install from VSIX…** → run `OpenSpec UI: Show Dashboard` | for VS Code users; workspace folder becomes the OpenSpec root automatically |

```bash
# Direct: open http://localhost:4321 in your browser
node /path/to/openspec-ui/bin/openspec-ui.js --dir . --port 4321
```

The Electron and VS Code channels spawn the same `bin/openspec-ui.js` under
the hood — the only difference is how the UI is presented (native window vs.
browser vs. VS Code webview). See [`electron/README.md`](../electron/README.md)
for build instructions and [`vscode-extension/README.md`](../vscode-extension/README.md)
for the VSIX pipeline.

### Install via VS Code extension

Instead of running a standalone CLI, VS Code users can install the packaged
extension and open the dashboard inside the editor as a webview panel.

```bash
# from the openspec-ui checkout
npm install
npm --workspace=vscode-extension run package
# → vscode-extension/openspec-ui.vsix
```

Then in VS Code: **Extensions** view → `⋯` menu → **Install from VSIX…** →
pick the file. Open the target project folder as your VS Code workspace and
run **OpenSpec UI: Show Dashboard** from the Command Palette. The dashboard
opens beside the editor; Apply / Archive / Merge / Run commands are typed
into VS Code's own terminal panel (a persistent terminal named "OpenSpec
UI") which auto-launches `claude --continue` on first use (configurable via
`openspecUI.terminalStartup`). No `--dir` or `--port` flag needed — the
workspace folder is the project root, and the port is picked automatically.

## Stage 3 — Add project-level configuration

These are optional but recommended.

### `docs/` for stage-① ideas and stage-② documentation

```bash
mkdir -p docs/ideas
# Copy or move existing READMEs / ADRs into docs/ as appropriate
```

### `agents.yaml` for the agent runner

```bash
cp /path/to/openspec-ui/agents.yaml.example agents.yaml
# Edit to define which agents you want exposed
echo ".worktrees/" >> .gitignore
```

### `CLAUDE.md` and the openspec-flow skill

Copying these from this repository gives Claude Code the same workflow rules
(propose-first discipline, idea capture, in-flight pivot guidance, etc.) when
it works inside your project.

```bash
cp /path/to/openspec-ui/CLAUDE.md /path/to/your-project/CLAUDE.md
cp -r /path/to/openspec-ui/.claude/skills/openspec-flow \
      /path/to/your-project/.claude/skills/
```

Edit the copied `CLAUDE.md` to remove the openspec-ui-specific command lines
(`npm test` etc.) and replace with your project's checks.

## Retrofitting existing assets

| You have | OpenSpec home |
|---|---|
| README / ARCHITECTURE.md | `docs/architecture.md` |
| ADRs | `docs/adr/` |
| Loose TODOs or issues | Promote the important ones via `/opsx:propose` |
| Old design conversations | `docs/ideas/<date>-<topic>.md` with `status: promoted` |
| Current system behavior | `openspec/specs/<capability>/spec.md` |
| Historical changes | `openspec/changes/archive/<YYYY-MM-DD>-<id>/` with `outcome.md` |

## First loop after migration

1. Open the dashboard at `http://localhost:4321`. Overview shows an empty
   Kanban.
2. Click **+ New Change** → describe what you want to build → the dashboard
   types `/opsx:propose "..."` into the embedded terminal, where Claude Code
   generates the four artifacts.
3. The new change appears in TODO. Click **Run** to spawn the agent in
   `.worktrees/<change-id>/` and watch progress in `/agents`.
4. When the agent finishes, **Merge** sends `git merge --no-ff` to the
   terminal. Review the diff, accept, and tasks.md updates flow back to the
   kanban via the file watcher.
5. When all tasks are complete and `outcome.md` is written, click **Archive**.
   The change moves to `/archive` with its history preserved.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Run button is hidden | `agents.yaml` is missing or empty. Check `/agents` page for the parse error if any. |
| Kanban doesn't react to terminal edits | The dashboard server and Claude Code must run in the **same environment** (both WSL or both native on Windows). See `add-embedded-terminal` outcome notes. |
| Embedded terminal won't open | PTY backend failed to load. `/api/health` shows `terminal.available: false`. The dashboard still works — drag/buttons just won't be able to inject commands. |
| `npx openspec` resolves a different version | The local `@fission-ai/openspec` devDep installs into your project's `node_modules`. Run `npm install` after migration. |

## Future improvements (not yet shipped)

- An `openspec-ui init` subcommand that performs all of Stage 3 in one shot
  is proposed as `add-init-command` (see active changes).
- Publishing to npm so `npx openspec-ui --dir .` works without manual install.
