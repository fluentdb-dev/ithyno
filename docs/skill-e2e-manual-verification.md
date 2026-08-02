# Manual verification: `/ithy-opsx:*` skills end-to-end

`scripts/skill-e2e.mjs` provides **structural coverage only** (does the
scaffold land, do command files resolve, does the server boot on 4321).
Semantic verification — does each skill actually do the right thing when
Claude Code invokes it — is manual.

**Test surface: Electron .app or VSCode extension**, not CLI. Real users
never invoke `bin/ithyno` directly; they get the Electron bundle or install
the VSIX. Manual verification runs against that real surface so any bug in
packaging / preload / IPC / onboarding UI surfaces alongside the skill
behavior.

This mirrors the pattern used by `verify-dispatch-e2e-N` (rounds 1–6,
archived under `openspec/changes/archive/`).

## When to run

- Before cutting a release (Electron builds + VSIX packages).
- After any change to `.claude/commands/ithy-opsx/*.md` /
  `.claude/skills/ithy-opsx-*/SKILL.md` (dev-copy).
- After any Electron/main-process, preload-sandbox, VSCode-extension,
  onboarding-window, or Init endpoint change.
- After any server-side change to `/api/changes/:id/{phase,needs-human,
  needs-human/answer}` or `/api/init`.

## Two test paths

Run **both** before a release:

- **Path A — Electron .app** (macOS primary, Windows / Linux as available)
- **Path B — VSCode extension** (VSIX installed into VSCode)

Structurally both hit the same server + skills, but each has its own
onboarding UI, PTY surface, and packaging boundaries.

## Path A — Electron .app

### A1. Build + launch

```bash
cd /path/to/openspec-ui
npm run electron:package:mac    # or :win / :linux
# Output: electron/dist/mac-*/ithyno.app (or .exe / .AppImage)
```

Launch the `.app` from `electron/dist/`. On first run the New Project
window opens.

### A2. Onboarding (per Path A)

1. **Doctor gate** — Doctor panel checks agent CLIs (claude / codex /
   copilot / …). At least one must be installed and green. Fail here
   means Doctor / installer is broken (`add-doctor-and-installer` scope).
2. **Choose Manager** — radio group of installed CLIs. Pick Claude for
   this pass.
3. **Choose target dir** — click Browse, pick a fresh empty dir under
   `$HOME/Documents` (e.g. `~/Documents/ithyno-verify-2026-07-27`).
4. **Confirm Init** — click Create. Watch for:
   - Success toast
   - Window transitions to main dashboard
   - `~/Documents/ithyno-verify-<date>/.claude/commands/{opsx,ithy-opsx}/`
     exist (open a Finder / Explorer to check)
   - `openspec/` dir exists in target
   - `agents.yaml` exists in target with claude as manager

**Fail modes:** Doctor gate stuck; no manager options; Browse doesn't
open native picker; Init reports success but files not scaffolded;
subsequent dashboard load 500s.

### A3. Manager PTY

Once onboarding completes, the main dashboard opens. Click the
**Terminal** tab (bottom of the left nav or in the header, depending on
layout).

Manager PTY should auto-launch — you see a running `claude` prompt.
That's the Manager. All `/ithy-opsx:*` skills are typed here.

**Fail modes:** Terminal tab empty; PTY spawned but claude not started;
`.claude/commands/ithy-opsx/` visible from PTY's cwd but slash commands
not recognized (indicates PTY started with wrong cwd — should be target
root, not electron install dir).

### A4. Per-skill checks (in Manager PTY)

For each skill: type in Terminal tab, observe outcome via dashboard
tabs (Kanban / Change Detail / Docs) and target filesystem.

Same 11-skill list as Path B — see the **Per-skill checklist** section
below (shared between paths).

## Path B — VSCode extension

### B1. Package + install

```bash
cd /path/to/openspec-ui
npm run --workspace vscode-extension package
# Output: vscode-extension/ithyno-vscode-*.vsix
```

Install into VSCode: `Extensions` → `…` → `Install from VSIX…` → pick
the generated `.vsix`. Reload VSCode.

### B2. Onboarding (per Path B)

1. Command palette (`Cmd+Shift+P`) → `openspec-ui: New Project`.
2. Same 3 steps as Electron: Doctor gate → Manager choice → target dir.
3. Dashboard opens as a VSCode webview panel.

**Fail modes (path-specific):** command not registered (VSIX packaging
issue); webview shows white / CSP error (`add-preload-sandbox-import-
guard` scope regressed); native picker doesn't open (Electron shell API
differs across VSCode versions).

### B3. Manager PTY

VSCode's own Terminal panel opens with the Manager Claude PTY.
Auto-launch happens per `add-vscode-dashboard-terminal-autostart`.

**Fail modes:** no auto-launch (autostart broke); PTY in wrong dir; PTY
opens outside VSCode (spawned to system terminal).

### B4. Per-skill checks

Same 11-skill list — see below.

## Per-skill checklist (shared A + B)

For each of the 11 `/ithy-opsx:*` skills:
1. Prepare state (Kanban → New Change or as noted).
2. Type slash command in Manager PTY.
3. Observe via dashboard UI and target filesystem.
4. Record ✓ / ✗ per template.

### 1. `/ithy-opsx:apply <change-id>`

**Prep:** Kanban → "+ New Change" → name it `smoke-apply` → dashboard
scaffolds `openspec/changes/smoke-apply/` with proposal/tasks/spec.
Edit `tasks.md` in Docs tab, leave one unchecked task ("Add
`docs/note.md` with the text 'smoke test'").

**Type:** `/ithy-opsx:apply smoke-apply`

**Expect:**
- Terminal shows Claude reading files, invoking Edit / Bash tools
  (approval UI in interactive mode; approve each).
- At end, prompt asks "commit OK?" — approve.
- Kanban card for `smoke-apply` shows a green ✓ (or moves lane).
- Docs tab: `tasks.md` checkbox now `[x]`.
- Filesystem: `docs/note.md` exists in target.
- Git log in target: new `impl: smoke-apply` commit.

**Fail:** silent no-op; no commit prompt; wrong branch touched.

### 2. `/ithy-opsx:review <change-id>`

**Prep:** post-apply state (change committed on `agent/smoke-apply` or
current branch).

**Type:** `/ithy-opsx:review smoke-apply`

**Expect:**
- `openspec/changes/smoke-apply/review.md` written.
- Change Detail tab in dashboard shows review verdict.
- Frontmatter valid: `verdict: pass|needs-rework`, `summary`, `findings`.

**Fail:** no artifact; malformed frontmatter.

### 3. `/ithy-opsx:verify <change-id>`

**Prep:** same as review.

**Type:** `/ithy-opsx:verify smoke-apply`

**Expect:**
- Terminal shows `npm test`, `npm run typecheck`, `npm run build` in
  fail-fast order.
- `review.md` overwritten with verify verdict.
- Change Detail tab reflects updated verdict.

**Fail:** all three run despite early fail; wrong artifact path.

### 4. `/ithy-opsx:merge <change-id>`

**Prep:** `agent/smoke-apply` branch with commits (auto if apply used a
worktree).

**Type:** `/ithy-opsx:merge smoke-apply` (or click Merge button on the
Kanban card).

**Expect:**
- `git merge --no-ff agent/smoke-apply` runs on target's main.
- Auto-stash + auto-pop if working tree dirty.
- Kanban card moves lane / gets Archive button.
- Prompt: "Remove worktree + delete branch?" — approve.

**Fail:** stash leak; no merge commit; cleanup runs without prompt.

### 5. `/ithy-opsx:archive <change-id>` (or Kanban Archive button)

**Prep:** merged state + `outcome.md` written (dashboard prompts if
missing).

**Type:** `/ithy-opsx:archive smoke-apply` OR click Archive button.

**Expect:**
- Approval prompt for commit message → approve.
- `openspec/changes/smoke-apply/` moves to
  `openspec/changes/archive/<date>-smoke-apply/`.
- Kanban card removed.
- Docs tab: archive dir visible.
- Git log: `archive: smoke-apply` commit.

**Fail:** validation errors block (workaround: use `--no-validate` via
CLI); no approval prompt; card lingers.

### 6. `/ithy-opsx:revert <scope>`

**Prep:** ensure at least one archived change exists (from step 5 or
prior).

**Type:** `/ithy-opsx:revert smoke-apply` (targets the archived one).

**Expect:**
- Terminal prompts for target requirement(s) if ambiguous.
- New `openspec/changes/revert-smoke-apply/` dir with proposal/tasks/
  spec-delta.
- PENDING annotation inserted into current spec.
- Case α: REVERTED annotation on the archived proposal.
- Kanban shows the new revert change.

**Fail:** no PENDING; wrong Case; validate fails.

### 7. `/ithy-opsx:import <target-path>`

**Prep:** create a second scratch dir with some markdown/code but no
`openspec/`.

**Type:** `/ithy-opsx:import /path/to/other/project`

**Expect:**
- Terminal shows Task tool spawn (sub-agent).
- Sub-agent reads target's files.
- `<target>/openspec/specs/` populated with first-draft specs.
- `<target>/openspec/GENERATED.md` marker file written.
- Dashboard's Browse tab (if applicable) shows the imported project.

**Fail:** no sub-agent spawn; empty specs; no GENERATED.md.

### 8. `/ithy-opsx:escalate <change-id> "<question>"`

**Prep:** in-flight change in `coded` or `reviewed` phase (from step 1
or seed via Kanban).

**Type:** `/ithy-opsx:escalate smoke-apply "Should we skip step X?"`

**Expect:**
- Terminal shows Bash tool invocation (curl POST). Approve.
- Kanban card moves to needs-human lane (or gets ⚠ badge).
- `openspec/changes/smoke-apply/needs-human.md` written.
- Change Detail tab surfaces the escalation.

**Fail:** 409 without prior escalation; phase unchanged; no badge.

### 9. `/ithy-opsx:answer <change-id> "<answer>"`

**Prep:** change in `needs-human` state (from step 8).

**Type:** `/ithy-opsx:answer smoke-apply "Yes, skip step X"`

**Expect:**
- Bash tool POST to `.../needs-human/answer`. Approve.
- Change phase restored to `priorPhase`.
- Answer appended to `needs-human.md`.
- Kanban badge cleared; card back in prior lane.

**Fail:** 409 (not in needs-human); no phase restore.

### 10. `/ithy-opsx:dispatch <change-id>` (or Kanban Start button)

**Prep:** in-flight change at `proposed`; `agents.yaml` has at least
`claude` as manager + code roles.

**Type:** `/ithy-opsx:dispatch smoke-apply` OR click Start button in
Kanban.

**Expect:**
- Terminal shows worktree creation, worker dispatch (code → review →
  verify).
- Kanban card advances through phases live via WS.
- Terminal (or a spawned tmux pane if agmsg configured) shows worker
  activity.
- Terminal state: change reaches `done` or `needs-human`.

**Fail:** wrong worker prompt; skips review; loops past
`maxReworkRounds`; escalates on convergent state.

### 11. `/ithy-opsx:dispatch-multi <id-1> <id-2> [<id-N>]`

**Prep:** 2+ changes at `proposed`.

**Type:** `/ithy-opsx:dispatch-multi smoke-a smoke-b`

**Expect:**
- Both cards advance concurrently (up to `maxParallel`).
- Terminal shows interleaved worker activity per change.
- One card's escalation doesn't stop the other.

**Fail:** serial (one card waits for the other); shared state
corruption; both die if one dies.

## Reporting template

Paste into the release cut ticket:

```markdown
## Skill e2e manual verification — Path A (Electron) / Path B (VSCode)

Environment:
- OS: macOS 14.5 / Windows 11 / Ubuntu 22.04
- Node: 20.x
- Claude Code: X.Y.Z
- Ithyno: <commit sha>

| # | Skill | Path A | Path B | Note |
|---|---|---|---|---|
| 1 | apply | ✓ | ✓ | |
| 2 | review | ✓ | ✓ | |
| 3 | verify | ✓ | ✓ | |
| 4 | merge | ✓ | ✓ | |
| 5 | archive | ✓ | ✓ | --no-validate (pre-existing PENDING format) |
| 6 | revert | ✓ | ✓ | |
| 7 | import | ✓ | ✓ | Second target: /tmp/import-target |
| 8 | escalate | ✓ | ✓ | |
| 9 | answer | ✓ | ✓ | |
| 10 | dispatch | ✓ | ✓ | agents.yaml: claude + code, verify manager-fallback |
| 11 | dispatch-multi | ✓ | ✓ | 2 changes parallel |

Bugs found: <link to issues / PRs>
```

Failing skills → open a bug (link the failure mode from the checklist)
or ship the release with the failure documented as a known issue.

## Time budget

| Setup | ~10 min per path (build/package + onboarding) |
| Per-skill | 3-15 min (dispatch/dispatch-multi are the longest) |
| Both paths total | 2-3 hours |

Runnable in one session by a maintainer familiar with the surface.

## Related

- **Structural coverage:** `E2E=1 npm run e2e:skills` — automated
  scaffold + server-boot checks. ~15s. Runs against Path A / B's
  backing plumbing.
- **Drift guard:** `npm test` — dev-copy ↔ templates byte identity. <2s.
- **Bundle shape:** `npm run release:verify-bundle` — npm pack + Electron
  .app ship ithy-opsx only under `templates/.claude/`. ~5s (needs a
  built Electron bundle for full coverage).
- **Prior manual rounds:** `openspec/changes/archive/*-verify-dispatch-e2e-*`
  document historical maintainer runs (CLI-based, superseded by this
  Electron/extension-based doc).
