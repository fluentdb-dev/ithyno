# Architecture Design

Technical design for ithyno, based on a **local browser dashboard** and
**OpenSpec compatibility**.

---

## 1. Goals and Non-goals

### Goals

- Treat the OpenSpec `openspec/` directory as the single source of truth and
  **visualize** progress.
- Support **bidirectional editing** of checkboxes in `tasks.md` from the UI
  (UI ↔ file).
- Reflect external edits made by AI agents in the UI **immediately**.
- Keep Markdown clean by avoiding custom HTML comments or proprietary syntax.

### Non-goals (not covered in v1)

- Strict exclusion control for multiple repositories, remote synchronization,
  or concurrent multi-user editing.
- Replacing OpenSpec's own CLI functionality, such as `openspec change`.
- Rich WYSIWYG editing of requirement or scenario text. In v1, specifications
  are **read-only**, and editing is limited to checkboxes.

---

## 2. Target OpenSpec Structure

```
openspec/
├── specs/
│   └── [domain]/
│       └── spec.md              # Current specification (source of truth)
└── changes/
    ├── [change-name]/
    │   ├── proposal.md          # Why and what to change (## Intent / ## Scope / ## Approach)
    │   ├── design.md            # Technical approach
    │   ├── tasks.md             # Implementation checklist (source of progress)
    │   ├── .openspec.yaml       # Metadata
    │   └── specs/
    │       └── [domain]/
    │           └── spec.md      # Delta specification (## ADDED/MODIFIED/REMOVED)
    └── archive/
        └── [YYYY-MM-DD-change-name]/   # Completed changes
```

### Parsed formats

**tasks.md (the core progress document)**

```markdown
# Tasks

## 1. Theme Infrastructure
- [ ] 1.1 Create ThemeContext with light/dark state
- [x] 1.2 Add CSS custom properties for colors

## 2. UI Components
- [ ] 2.1 Create ThemeToggle component
```

- `## N. <section>` defines a logical group.
- `- [ ] N.M <text>` and `- [x] N.M <text>` define individual tasks with
  hierarchical numbering such as 1, 1.1, and 1.2.

**spec.md / delta spec**

```markdown
## Purpose
...
### Requirement: User Authentication
The system SHALL ...
#### Scenario: Valid credentials
- GIVEN ...
- WHEN ...
- THEN ...
```

Delta specifications use `## ADDED Requirements`,
`## MODIFIED Requirements`, and `## REMOVED Requirements`.

**proposal.md** uses `## Intent`, `## Scope`, and `## Approach`.

---

## 3. System Architecture

The system has three layers and runs entirely on the local machine.

| Layer | Responsibility | Primary technology |
|---|---|---|
| **Client** | Dashboard rendering and interaction | Vite + React + TypeScript |
| **Server** | Parsing, surgical editing, and file watching | Node.js + Fastify + chokidar |
| **Store** | Source of truth | `.md` files under `openspec/` |

The client and server can run in a single process, with Fastify serving the
static assets. During development, they can instead run as a Vite development
server with a proxy.

### Data flow

1. **Initial load** — The server recursively scans `openspec/`, parses it into
   the domain model, and returns it from `GET /api/state`.
2. **UI → file (toggle)** — A checkbox action calls
   `POST /api/tasks/toggle`. The server rewrites **only the corresponding
   line** in the relevant `tasks.md` file.
3. **File → UI (external edit)** — chokidar detects the change, the server
   parses the affected difference, and WebSocket pushes it to every client.

---

## 4. Technology Choices and Rationale

| Area | Choice | Rationale / alternatives |
|---|---|---|
| Frontend | **React + TypeScript + Vite** | Type safety, HMR, and ecosystem. Alternative: Svelte, which is lighter but less familiar to the intended contributors. |
| Server | **Node.js + Fastify** | A shared language with the frontend, with a lightweight and fast runtime. Alternatives: Express, which is mature but slower; or a Vite plugin alone, which would complicate file-watching logic. |
| Markdown parsing | **unified / remark + remark-gfm** | Safely handles GFM task lists as an AST. Position data enables accurate line identification. A custom regular-expression parser would be brittle. |
| File watching | **chokidar** | Stable and cross-platform. `awaitWriteFinish` prevents reading a file while it is still being written. |
| Real-time communication | **WebSocket (`ws`)** | Bidirectional and low-latency. SSE would be sufficient for server-to-client communication, but WebSocket is selected for overall simplicity. |
| Client state | **Zustand** | Lightweight and easy to replace wholesale in response to WebSocket events. Redux would be excessive. |
| UI | **Tailwind CSS + minimal custom components** | Fast to develop. Kanban drag and drop uses `@dnd-kit`. |
| CLI | **Node bin + `commander`** | Starts through `npx openspec-ui`. |
| Distribution | **npm package** | Runs immediately through `npx openspec-ui`. |

---

## 5. Domain Model (Internal Server Representation)

The parsed result uses the following normalized, read-only model. **The system
does not serialize this model back into a complete Markdown document**, due to
the synchronization strategy described later.

```ts
type WorkspaceState = {
  root: string;                 // Absolute path to openspec/
  specs: SpecDomain[];          // Current specifications
  changes: Change[];            // Active changes
  archive: ChangeSummary[];     // Completed changes (summary only)
};

type Change = {
  id: string;                   // Directory name = change-name
  proposal: ProposalDoc | null; // Intent/Scope/Approach
  design: RawDoc | null;
  tasks: TaskList;
  deltaSpecs: SpecDomain[];
  progress: { done: number; total: number };
};

type TaskList = {
  filePath: string;
  sections: TaskSection[];
};

type TaskSection = { title: string; tasks: Task[] };

type Task = {
  id: string;        // For example, "1.2"
  text: string;
  checked: boolean;
  line: number;      // Zero-based line number in tasks.md, used to locate edits
  filePath: string;
};
```

Retaining `line` is the key to bidirectional synchronization. A toggle from the
UI sends the file path, line number, and expected state, and the server edits
only that line.

---

## 6. Bidirectional Synchronization Design (Core of the Project)

This section directly addresses the main trade-offs identified by the original
design: concurrent editing conflicts and the risk of introducing a Markdown
dialect.

### 6.1 Basic principle: use surgical edits instead of full serialization

An update from the UI must **not regenerate and overwrite** `tasks.md` from the
model. Full regeneration would:

- Destroy comments, blank lines, and formatting variations written by an AI,
  producing unnecessary diffs.
- Conflict with the design goal of keeping Markdown readable.

Instead, replace **only the single checkbox state character** on the target
line.

```
Before: - [ ] 1.2 Add CSS custom properties for colors
After:  - [x] 1.2 Add CSS custom properties for colors
          ↑ Only this character changes. Every other byte remains untouched.
```

The implementation reads the target file, performs exactly one strict regular-
expression replacement of `- [ ]` ⇄ `- [x]` on the `line` entry, and writes
the file back. Indentation, task number, and task text remain unchanged.

**The regular expression must strictly capture only the marker portion.**
Reconstructing the whole line risks damaging multiline tasks with indented
continuation lines.

```markdown
- [ ] 1.2 Add CSS custom properties for colors
      (Note: Use OKLCH color space)        ← Continuation line; never modify it
```

Selected pattern, which replaces only the checkbox state and preserves the
text through capture groups:

```
/^(\s*[-*]\s*\[)[ xX](\]\s+)/
→ Insert only the replacement state character (' ' or 'x')
```

- Capture leading whitespace, the list marker (`-` or `*`), `[`, and the
  whitespace following `]`; rewrite only the character between the brackets.
- Accept uppercase `X` when reading existing content, but normalize writes to
  lowercase `x`.
- Never touch continuation lines, task text, or trailing comments.
- Enforce this strict behavior with required unit-test cases in
  `surgicalEdit.ts`, covering multiline tasks, tab indentation, `*` markers,
  and uppercase `X`.

### 6.2 Conflict detection (optimistic locking)

In addition to the **hash (or mtime)** last observed by the UI for the file, a
toggle request includes the **original target-line text (`expectedText`)**.

```
POST /api/tasks/toggle
{ filePath, line, expectedChecked: true, baseHash: "sha1:...", expectedText: "- [ ] 1.2 Add CSS custom properties for colors" }
```

Immediately before writing, the server rereads the file and makes a two-stage
decision:

1. **Hash matches** → Perform the surgical edit directly (fast path).
2. **Hash does not match**, meaning an external edit occurred in the meantime
   → Do not reject immediately. Attempt a fallback that absorbs line shifts:
   - If the line at `line` exactly matches `expectedText`, edit it directly.
   - Otherwise, search the entire file for exactly one line that matches
     `expectedText`. If found, edit that line and **automatically correct the
     line shift**.
   - Only when there are zero matches or more than one ambiguous match, do not
     write. Return **409 Conflict** with the latest state.

The intent is to avoid a 409 when an AI merely inserts lines near the top of a
document. Although the hash changes, the target task can still be identified
by `expectedText`. A real 409 is therefore limited to the rare case where the
AI has modified **the target task line itself**.

This prevents lost updates without depending on OS-level file locking, in
favor of robustness and portability.

### 6.3 Echo suppression (preventing write loops)

If chokidar observes the server's own writes, it causes unnecessary reparsing
and pushes. To prevent this:

- Record the **new hash immediately after a server write**. Ignore a watcher
  event whose hash matches it.
- Enable chokidar's `awaitWriteFinish` so the server never reads a partially
  written file.

### 6.4 External-edit update flow

```
AI edits tasks.md
  → chokidar change event (after awaitWriteFinish)
  → Compare hashes: ignore a self-triggered write / continue for an external edit
  → Reparse only the affected file instead of rescanning everything
  → Push { type: "change-updated", changeId, ... } to every client over WebSocket
  → The UI updates the affected progress bar and checkbox state immediately
```

### 6.5 AI streaming writes and the “Writing…” indicator

`awaitWriteFinish` in section 6.3 correctly delays reparsing until a write has
settled, but it has a side effect: **Cursor and Claude often append content
incrementally over several seconds or tens of seconds instead of overwriting a
file in one operation**. The UI remains quiet during that period and updates
only after the AI output stops changing.

- **v1 (phases 1 and 2)**: This batched update behavior is acceptable. Data
  remains consistent and the final result appears correctly.
- **Future extension (phase 3 and later)**: Observe chokidar's `add` or initial
  `change` event before `awaitWriteFinish` settles and send only a lightweight
  **“AI is writing…”** status over WebSocket. Do not parse the content; show a
  writing badge for the affected change or file. Once the write settles, send
  the normal `change-updated` event. Users can then see that an AI is modifying
  a file and avoid conflicting actions such as toggling it mid-write.

### 6.6 Parser robustness

- Obtain each task's line number from the remark AST `position`. This is more
  robust than scanning with regular expressions and avoids false positives
  from nested lists or `- [ ]` inside code blocks.
- If parsing fails because of malformed Markdown, return that file with a
  `parseError` and let the UI fall back to raw-text display. A broken file must
  **never crash the UI**.

---

## 7. REST / WebSocket API (v1)

### REST

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/state` | Return normalized state for the entire workspace |
| `GET` | `/api/changes/:id` | Return one change in detail, including document bodies |
| `POST` | `/api/tasks/toggle` | Surgically edit a checkbox with optimistic locking and automatic line-shift correction using `baseHash` and `expectedText`; see section 6.2 |
| `GET` | `/api/file?path=` | Return raw text for any `.md` file as a viewing fallback |

### WebSocket (server → client push)

```ts
type ServerEvent =
  | { type: "state-replaced"; state: WorkspaceState }      // Large change
  | { type: "change-updated"; changeId: string; change: Change }
  | { type: "spec-updated"; domain: string; spec: SpecDomain }
  | { type: "file-writing"; filePath: string; changeId?: string }  // AI is writing (section 6.5, phase 3+)
  | { type: "conflict"; filePath: string };                // Conflict notification
```

---

## 8. UI Design

### Screens

1. **Overview (home)**
   - Display active changes as cards. Each card contains a **progress bar
     (done/total)**, title, and Intent summary.
   - Display an overall summary with total task count and completion rate.
2. **Change details**
   - Tabs: `Tasks`, `Proposal`, `Design`, and `Delta Specs`.
   - The `Tasks` tab contains a **progress tree** with a section-to-task
     hierarchy and, optionally, a two-column **Kanban** board (Todo / Done)
     using `@dnd-kit`. Dropping a task toggles it.
   - Clicking a checkbox toggles it immediately. Show a toast on conflict.
3. **Specs browser**
   - List the domains under `openspec/specs/`, then display requirements and
     scenarios formatted as Given-When-Then. This view is **read-only**.
4. **Archive (optional / later phase)**
   - List completed changes.

### Synchronization UX principles

- When an external edit arrives, smoothly update areas that the user is not
  currently manipulating and briefly flash the changed row.
- Never destructively overwrite a 409 conflict. Make the user aware of it
  before fetching the latest state.

### Recovery UX for conflicts (409)

The `expectedText` fallback in section 6.2 limits a **409 to the rare case
where an AI has modified the target task line itself**. The UI should therefore
avoid global and destructive responses such as dimming the entire screen or
forcing a reload. Those responses would be disproportionate to a rare,
localized event and would disrupt the user's context.

Use a three-stage strategy: **optimistic update + silent background
reconciliation + localized confirmation prompt**.

1. **Optimistic update**: Immediately flip the checkbox in the UI when it is
   clicked, creating zero perceived latency.
2. **Background reconciliation**: On a 409, **silently replace** the relevant
   state with the latest state included in the response. Do not show a toast;
   briefly highlight only the changed areas. This fully handles updates to
   tasks that the user did not touch.
3. **Localized confirmation**: Only when the conflict affects **the exact task
   line the user operated on**, roll back the optimistic update and show an
   inline message on that row:
   - Show “This item was updated by an AI” together with the **new text**.
   - Provide a one-click **“Check again”** button that resubmits with the new
     `expectedText` and `baseHash`.
   - Optionally show a subtle, automatically dismissing toast. **Do not use a
     modal or lock the screen.**

Design principle: **Preserve the user's intent to check the item, do not take
over the entire screen, and guide the user toward reapplying the operation with
minimal friction while keeping the conflict localized.**

---

## 9. Project Directory Structure (Implementation)

```
openspec-ui/
├── package.json
├── bin/
│   └── ithyno.js          # CLI entry point (commander)
├── server/
│   ├── index.ts                # Fastify startup, static serving, and WebSocket
│   ├── parser/                 # remark-based parsers
│   │   ├── tasks.ts
│   │   ├── spec.ts
│   │   └── proposal.ts
│   ├── sync/
│   │   ├── watcher.ts          # chokidar + echo suppression
│   │   └── surgicalEdit.ts     # Line-level checkbox editing + optimistic locking
│   └── model.ts                # Domain types
├── web/                        # Vite + React
│   ├── src/
│   │   ├── store.ts            # Zustand + WebSocket handlers
│   │   ├── pages/{Overview,ChangeDetail,Specs}.tsx
│   │   └── components/{ProgressBar,Kanban,TaskTree}.tsx
│   └── index.html
├── docs/
│   ├── architecture.md
│   └── roadmap.md
└── README.md
```

---

## 10. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Concurrent-edit conflicts and lost updates | Use optimistic locking with `baseHash`, then refetch on 409. Never fully reserialize the file. |
| Frequent 409 responses due to shifted line numbers, degrading UX | Use the `expectedText` fallback to relocate the target line by exact content and correct line shifts automatically. Require localized reconfirmation only for a real 409; see sections 6.2 and 8. |
| Damage to multiline tasks, tab indentation, or `*` markers | Replace only the single state character with a strict regular expression and comprehensive unit tests; see section 6.1. |
| Silent UI while an AI streams writes | Accept batched updates in v1. Add lightweight “Writing…” WebSocket events in phase 3; see section 6.5. |
| Write loops caused by the server observing itself | Record the post-write hash, ignore matching watcher events, and use `awaitWriteFinish`. |
| Introducing a Markdown dialect | Do not embed UI metadata in `.md` files. Derive numbering, order, and other required data from standard OpenSpec syntax. |
| A parse failure crashes the UI | Fall back to per-file `parseError` raw-text display. One damaged file must not affect the rest of the workspace. |
| Slow initial scans in large repositories | Prioritize active `changes/` during startup and lazy-load `archive/`. |

---

## 11. Manager Terminal and Local Security

ithyno provides a project-scoped Manager terminal, but the transport depends on
the client:

- **Electron and direct browser clients** render xterm.js inside the dashboard.
  The server creates the shell through a PTY and bridges input and output over
  the authenticated `/pty` WebSocket.
- **VS Code Extension** hides the embedded xterm.js surface and uses a native
  VS Code Terminal. Dashboard commands cross the webview bridge as `pty.*`
  messages and are inserted into that terminal by the extension host. The VSIX
  intentionally does not package the server's native PTY dependency.

The Manager terminal is not tied to the internal `ChangeDetail` component. Its
presentation follows the client: a dashboard pane in Electron/browser and a
native editor terminal in VS Code.

### Shell selection and graceful degradation

- For the Electron/browser server PTY, macOS and Linux use `$SHELL` with
  `/bin/bash` as a fallback. Windows prefers `pwsh.exe` and otherwise uses
  `powershell.exe` through Windows 10 1809+ ConPTY.
- `ITHYNO_SHELL` overrides that server-PTY shell. It does not select the shell
  of the native VS Code Terminal.
- If `@homebridge/node-pty-prebuilt-multiarch` cannot load, `/api/health`
  reports `terminal.available: false` and Electron/browser hide the embedded
  terminal. The dashboard continues running. VS Code remains able to use its
  native terminal because it does not depend on this module.

The server and agent CLI must operate in the same filesystem environment. In
particular, a Windows-native server must not watch files edited by an agent
running inside WSL, or vice versa. Both processes may run natively or both may
run inside WSL. This also applies when a VS Code terminal profile launches a
different environment from the extension host.

### Local security boundary

The PTY exposes a real local shell, so remote exposure is not supported. The
server binds to `127.0.0.1`, and PTY WebSocket upgrades are accepted only from
local clients. Local binding alone does not protect the server from a hostile
web page, so mutating endpoints use three additional controls:

1. **Session token** — resolved once for the server process and included in its
   launch URL. A direct launch generates a token; Electron or VS Code may inject
   an authoritative token for the Dashboard session. Mutating requests and
   WebSocket upgrades must provide the matching token.
2. **Origin allow-list** — accepts the active localhost origins and the VS Code
   webview origin while rejecting unrelated browser origins.
3. **Content-Type validation** — mutating requests reject an explicitly
   incompatible content type, preventing simple cross-origin form submissions.

These controls protect separate parts of the request boundary and should not be
collapsed into a single check. User-facing recovery instructions belong in the
Pages troubleshooting guide rather than in this architecture document.
