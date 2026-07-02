---
status: promoted
tags: [feature/merge, feature/agent-runner, area/skills, area/web]
source: conversation
related:
  - docs/ideas/2026-06-24-task-assignment.md
promoted_to: openspec/changes/add-ithy-opsx-archive/proposal.md
---

> **Promotion note (2026-07-02)**: Idea B (the `ithy-opsx:` namespace)
> is now real, promoted via `add-ithy-opsx-archive` — the first concrete
> command in the namespace. Idea A (`/ithy-opsx:merge` as a standalone
> command) remains open for a follow-up proposal. The archive skill
> covers the merge step inline for the archive path; a separate merge
> command is still worthwhile when the user wants to merge without
> archiving.

# Merge as a Claude-Code-orchestrated workflow + `ithy-opsx:` namespace

Two design conclusions from the 2026-07-01 conversation, captured together
because they share the same underlying decision: **merge is delicate enough to
deserve its own opsx-family slash command, and ithyno-provided extensions of
opsx should live in a distinct `ithy-opsx:` namespace.**

Neither is a formal change proposal yet. The next time we open this can, both
should ship together (the merge command is the first concrete use of the new
namespace, so the namespace convention lands "for free" as part of it).

## Idea A — Merge should not be a raw `git merge` inject

### Current behavior (2026-07-01)

Kanban's **Merge** button opens `CommandModal` with a preview of
`git merge --no-ff agent/<change-id>` and PTY-injects it into the embedded
terminal when the user confirms. **Discard** cleans up the worktree and branch
in a separate action, also via PTY inject.

### Why this is thin

| aspect | today | consequence |
|---|---|---|
| conflict handling | terminal only | dashboard sees nothing, user resolves in editor blind to Kanban state |
| test verification | not enforced | merging red code is easy to do by accident |
| target branch | `git merge` uses current HEAD | wrong-branch merge is trivial to trigger |
| cleanup | separate Discard click | worktree residue accumulates |
| archive step | separate `openspec archive` | often forgotten; spec/history drift |
| CLI mode | inject fails silently | no fallback path |

### Proposed direction

Replace the raw `git merge` inject with a Claude-Code-orchestrated command:

```
Merge button → PTY inject `/ithy-opsx:merge <change-id>`
```

The slash command is the **entry point** (`.claude/commands/ithy-opsx/merge.md`),
kept minimal — it just says "follow the merge skill for this change id". The
actual multi-step procedure lives in a **skill** (`.claude/skills/ithyno-merge/SKILL.md`
— name TBD) that walks Claude through:

1. **Preflight** — no uncommitted work in worktree, `git fetch`, rebase
   `agent/<id>` onto latest main (pause on conflict, ask the user to
   resolve, resume).
2. **Verify** — `npm test && npm run typecheck && npm run build` inside the
   worktree; abort with a report if anything fails.
3. **Spec integrity** — `openspec validate <id>` passes, `tasks.md` is fully
   `[x]`, `outcome.md` exists (prompt if missing).
4. **Merge** — `git merge --no-ff agent/<id>` onto the current branch, with
   an explicit "target = <branch>" confirmation printed before running.
5. **Post-merge** — `openspec archive <id>`, `git worktree remove`,
   `git branch -D agent/<id>`, final report.

### Variants worth keeping in mind (not v1)

- `/ithy-opsx:merge --squash <id>` — single commit form
- `/ithy-opsx:merge --ff-only <id>` — no merge commit, requires clean rebase
- `/ithy-opsx:review <id>` — diff summary + risk narrative before merging
- `/ithy-opsx:reject <id>` — record why the change was dropped in outcome.md
  then cleanup

### Non-goals for v1

- Server-side merge (no PTY dependency): interesting but delays v1; keep as a
  future ADR if the CLI-mode gap becomes a real complaint.
- In-dashboard conflict resolution UI: large; defer until v1 shows this is
  worth the surface area.

### Impact preview (for the eventual proposal)

- New skill file (`.claude/skills/ithyno-merge/SKILL.md`)
- New slash command (`.claude/commands/ithy-opsx/merge.md` or nested layout)
- `web/src/components/Kanban.tsx`: Merge button now injects
  `/ithy-opsx:merge <id>` instead of the raw git command; Discard becomes
  vestigial for the happy path (kept for orphan cleanup)
- Docs update: `docs/architecture/parallel-shells.md` gains a "Merge flow"
  section

### Note on Claude Code's two-tier model (slash command vs skill)

For ithyno-provided extensions, always pair the two:

- `.claude/commands/ithy-opsx/<verb>.md` — the **entry point**. Kept minimal
  ("follow the skill for change $ARGUMENTS"). This is what the user (or the
  dashboard) types.
- `.claude/skills/<name>/SKILL.md` — the **procedure and judgment rules**.
  Claude Code loads it progressively when the situation matches.

The split matters because slash commands are read as prompts once, while
skills carry the recurring know-how (preflight rules, conflict handling,
retry policy) that we want Claude to reuse across contexts.

## Idea B — Namespace convention: `ithy-opsx:` for ithyno's opsx extensions

### Decision

Two co-existing namespaces:

| namespace | ownership | what lives here |
|---|---|---|
| `opsx:` | upstream OpenSpec | pure spec workflow: `propose`, `apply`, `archive` |
| `ithy-opsx:` | ithyno app | ithyno-provided extensions of opsx: `merge` (v1), and future `spawn`, `review`, `reject` |
| `ithy:` | ithyno app | app-only operations unrelated to opsx: `launch`, `project-switch` |

### Why `ithy-opsx:` and not the alternatives

Considered and rejected:

- **Add commands under `opsx:` directly** (`/opsx:merge`) — mixes upstream
  OpenSpec commands with ithyno-app-specific behavior; a future upstream
  `opsx:merge` would clash.
- **`opsx-ithy:`** — puts opsx first, obscuring that ithyno is the provider.
- **`ithyno-spec:`** — drops the `opsx` signal that the commands are
  extensions of the existing family.
- **Nested (`ithy:opsx:merge`)** — depends on Claude Code's nested-folder
  slash-command support, which we haven't verified.

`ithy-opsx:` reads as **"ithyno's opsx"** — subject-first, family-second,
which matches how a user reasons about the command's origin ("I installed
ithyno, therefore this extension exists").

### Convention

- **`ithy-opsx:<verb>`** — anything that acts on an OpenSpec change (an id
  in `openspec/changes/`) with ithyno-specific orchestration.
- **`ithy:<verb>`** — app-scoped commands with no OpenSpec change context
  (dashboard launch, project selection, worktree cleanup that isn't tied to
  a specific change).
- Pure spec workflow stays under `opsx:` untouched.

### Discovery

- `/ithy` tab completion surfaces both `ithy:` and `ithy-opsx:` families,
  so users find the whole ithyno command surface from one prefix.
- `/opsx` tab completion surfaces only the upstream set, so a user who
  wants "pure OpenSpec" isn't distracted by app-specific commands.

## Idea C — Cross-CLI portability (phase 2, not v1)

### Where each CLI stands (as of ~2026-01, confidence varies)

| feature | Claude Code | Codex CLI | Antigravity | Cursor | Aider |
|---|---|---|---|---|---|
| project rules file | `CLAUDE.md` | `AGENTS.md` | `AGENTS.md` / bespoke | `.cursor/rules` | `CONVENTIONS.md` |
| user-triggered slash command | `.claude/commands/` | `.codex/prompts/` | ✓ (Rules/Prompts) | `.cursor/commands` | built-in only |
| **dynamically-loaded skill (SKILL.md style)** | ✓ | ✗ (rules always-on) | ✗ | partial (conditional `.mdc`) | ✗ |
| MCP | ✓ | ✓ | ✓ | ✓ | partial |
| sub-agent primitives | ✓ (Task/Agent) | weak | ✓ (Agent Manager) | ✓ (Composer) | ✗ |

Slash commands are near-universal. **SKILL.md-style progressive disclosure
is currently Claude Code specific** — other CLIs treat rules as always-on
or glob-matched, not situationally selected.

### Implication for ithyno

If ithyno wants to work beyond Claude Code (Codex / Antigravity users), the
`/ithy-opsx:*` surface has to be portable:

| piece | Claude Code | other CLIs | strategy |
|---|---|---|---|
| entry command | slash command in `.claude/commands/` | equivalent in `.codex/prompts/` etc. | mirror the same filenames; generate from one source |
| merge procedure | thin skill body | inlined into the prompt (no skill loading) | keep the **canonical procedure** in one place; render per-CLI wrappers around it |
| kanban button target | PTY inject `/ithy-opsx:merge <id>` | same string; CLI just interprets differently | no dashboard change needed |

### Recommendation

- **v1**: Claude Code only. The two-tier (command + skill) model is where
  ithyno's value is highest — the whole propose→merge→archive loop lives
  in that idiom.
- **Phase 2**: cross-CLI wrappers, once the Claude Code version has proven
  itself and the merge skill's procedure is stable enough to codify.
- **Verify at proposal time** that each CLI's docs still say what they said
  in 2026-01 — this is a fast-moving space.

## Open questions to resolve when proposing

1. Skill name: `ithyno-merge`? `ithy-opsx-merge`? Follow whatever pattern the
   existing `openspec-flow` skill sets when its rename lands (if it does).
2. Does Claude Code support nested slash-command folders? If yes,
   `.claude/commands/ithy-opsx/merge.md` is fine; if not, we may need
   `.claude/commands/ithy-opsx-merge.md` (namespace baked into filename).
3. Migration story for existing users: does the Kanban Merge button
   fall back to raw `git merge` inject when the skill isn't installed, or
   do we require the skill? Probably require + document the install step.
4. `Discard` button's future: subsume into `/ithy-opsx:merge` post-merge
   cleanup, or keep as an orphan-recovery escape hatch?
