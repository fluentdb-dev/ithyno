---
tags: [dashboard, import, openspec, spec-generation, llm, agents]
execution: worktree
---

## Why

`unify-open-project-3-branch` gives users a Browse read-only mode
for a non-openspec folder, but that mode is passive — the user can
skim markdown, but converting an existing codebase into an
openspec project still requires them to hand-write every
capability spec from scratch. For a mature repo (thousands of lines
of code, extensive `docs/`), that's a real barrier to adoption.

Import bridges the gap: point ithyno at an existing repo and have
it **generate a first-draft `openspec/specs/` set from the code
and `docs/`**, so the user starts from something close to reality
rather than an empty template. The draft is never authoritative —
it's a starting point the user reviews, edits, and archives normally
through the standard OpenSpec workflow.

Concrete target for the initial validation: a Flutter desktop app
(`/Users/cishihara/Documents/works/oyachisuguru0909/fluent_ui_navigationview_tabview_gorouter_boilerplate/`
— fluentdb, a SQL client). It has `lib/`, `docs/`, `pubspec.yaml`,
`CLAUDE.md`, `README.md`, and no `openspec/`. After import, we
expect capability-level spec drafts for the visible feature
surfaces (e.g., "sql-editor", "database-connections", "query-results",
etc.) with ADDED Requirements + a stub Scenario each — enough that
the user can iterate rather than start blank.

Approach: **(a) LLM-driven** (per user's design choice). A
dispatched code agent (Claude Code, sonnet or opus per
`agents.yaml`) reads the code + docs and writes `openspec/specs/`.
Static-heuristic (b) was considered and rejected as under-powered
for the messy reality of real repos.

## What Changes

- **New capability `project-import`** describing the flow.
- **New menu item / Browse-mode button**: "Import: generate openspec
  specs from this code" — visible in Browse mode
  (from `unify-open-project-3-branch`) and as a File-menu item on
  Electron when the currently-open folder has no `openspec/`.
- **New endpoint `POST /api/import/spec-generation`** — takes the
  current project root, verifies:
  - no existing `openspec/` (import would overwrite; block with 409
    if present unless `force: true` in the body)
  - reasonable size (repo total < 50 MB of code+docs by default;
    configurable cap)
  
  On accept, spawns a **generation job**: a Claude Code subagent
  invoked via the Task tool (Manager fallback path) OR via
  `/ithy-opsx:dispatch` if `agents.yaml` exists elsewhere — but
  for import, the target project by definition doesn't have
  `agents.yaml` yet, so this uses the **importer session's own
  agents.yaml** (i.e., ithyno's own — the tool's agents.yaml,
  not the target's).
  
  The generation job:
  1. Reads `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/**/*.md`
     into context.
  2. Walks the top-level source tree (`lib/`, `src/`, `app/`,
     language-appropriate) and reads a bounded sample of source
     files.
  3. Reads `package.json` / `pubspec.yaml` / `Cargo.toml` /
     equivalent to detect language + stated purpose.
  4. Runs `openspec init` on the target root (creates
     `openspec/specs/`).
  5. For each detected capability, writes
     `openspec/specs/<capability>/spec.md` with a Purpose section
     + at least one Requirement + one Scenario per requirement.
  6. Writes an `openspec/GENERATED.md` at the project root
     explaining that specs are LLM-generated drafts and how to
     iterate.

- **Progress + review UI**: while the generation job runs, dashboard
  shows a progress panel with the current file being read and the
  capability being drafted. On completion, dashboard transitions to
  the standard Kanban with the new project loaded — but a top-of-
  page banner reads "Specs are LLM-generated drafts — review before
  relying on them" until the user dismisses it.

- **NOT auto-committed**: the generation job leaves the project's
  git tree with untracked/added `openspec/` files. User reviews +
  commits manually. The banner reminds them.

- **Cost transparency**: before the job starts, the dashboard shows
  the estimated context size (bytes of source + docs to be read)
  and asks for confirmation. Prevents surprise on huge repos.

## Success

- Point ithyno at the fluentdb repo (Browse mode from
  `unify-open-project-3-branch` → "Import: generate specs" button)
  → confirmation dialog shows estimated size and files to be
  scanned → confirm → progress panel with live file names →
  completion → Kanban loads with the newly-initialized project.
- `openspec/specs/` contains at least 3 capability directories,
  each with:
  - a `spec.md` file with valid OpenSpec structure (Purpose +
    Requirements + Scenarios)
  - runs cleanly through `openspec validate --all --strict`
- `openspec/GENERATED.md` is present and readable.
- The user's original code, docs, git history, and non-openspec
  files are untouched.
- No commit is made automatically. `git status` shows
  `openspec/` (and `openspec/GENERATED.md`) as untracked/added,
  ready for the user's review + commit.
- On repos > 50 MB or when confirmation is not given, the job does
  NOT start.
- On repos with existing `openspec/`, the endpoint returns 409
  unless `force: true` is passed (protecting against accidental
  overwrite).
- Generation uses the ithyno tool's own `agents.yaml` (not the
  target project's, which by definition doesn't have one).
