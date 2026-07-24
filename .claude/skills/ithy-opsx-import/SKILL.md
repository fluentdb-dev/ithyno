---
name: ithy-opsx-import
description: Spawn a Task-tool sub-agent to import an existing project into OpenSpec. Invoked via `/ithy-opsx:import <target-path>` in the Manager's Claude Code session. Landed by refactor-import-to-task-tool-subagent.
---

# `/ithy-opsx:import <target-path>` — import sub-agent launcher

This skill is the recipe Claude (Manager) runs when ithyno's server
injects `/ithy-opsx:import <target-path>` into the Manager's PTY.

## When Claude runs this

- Server injects the string `/ithy-opsx:import /path/to/target` into
  the Manager's PTY after a user initiates import from the dashboard.
- User types the command directly in the Manager's terminal.

## Input

`$ARGUMENTS` — absolute path to the target project root. If empty or
not an absolute path, report the error and stop.

## Steps

### 1. Preflight

1. Verify `$ARGUMENTS` is non-empty and starts with `/`. If not:
   - Report: `Error: /ithy-opsx:import requires an absolute target path.`
   - Stop.

2. Verify the target directory exists:
   ```bash
   test -d "$ARGUMENTS" && echo exists || echo missing
   ```
   If missing, report: `Error: target path does not exist: $ARGUMENTS` and stop.

3. Announce: `[import] Starting sub-agent for $ARGUMENTS`

   An existing `openspec/` directory at `$ARGUMENTS/openspec` is
   intentionally allowed. Pattern B (in-place import after Init)
   always sees `openspec/` present, and the sub-agent's `openspec
   init` step is idempotent — existing scaffold is preserved and
   only per-capability spec files are (over)written in Step 5.

### 2. Spawn Task-tool sub-agent

Use the Task tool with the following parameters:

- `subagent_type`: `"claude"`
- `description`: `"Import sub-agent: generate OpenSpec specs for $ARGUMENTS"`
- `prompt`: Use the **Boot Prompt Template** below, substituting
  `<TARGET_PATH>` with the actual `$ARGUMENTS` value.

The Task tool runs the sub-agent synchronously from Manager's
perspective. Manager's context receives only the sub-agent's
final return message — not the individual Read/Grep/Bash calls
the sub-agent makes during discovery.

### 3. Return summary

After the Task tool returns, output the sub-agent's JSON summary:

```
[import] Sub-agent completed for <TARGET_PATH>.
Summary: <sub-agent returned text>
```

If the Task tool reports failure (throws or returns an error):
- Report: `[import] Sub-agent failed for <TARGET_PATH>: <error>`
- Do NOT retry automatically — let the user decide.

---

## Boot Prompt Template

```
You are the import sub-agent for `<TARGET_PATH>`. Your job is to
read that project's code and docs and produce first-draft OpenSpec
capability specs, then write the `openspec/GENERATED.md` completion
marker.

**Start by `cd`-ing into the target:**

```bash
cd <TARGET_PATH>
```

All relative paths below are relative to `<TARGET_PATH>`.

---

### Step 1 — Discovery: read docs and manifest

Read these files if they exist (skip silently if missing):

- `README.md`
- `CLAUDE.md`
- `CONTRIBUTING.md`
- All `*.md` files under `docs/`
- The first manifest file found: `pubspec.yaml`, `package.json`,
  `Cargo.toml`, `pyproject.toml`, or `setup.py`

### Step 2 — Discovery: sample the source tree

Detect the project type from the manifest and walk the primary source dir:

| Manifest present    | Primary source dir(s)          |
|---------------------|-------------------------------|
| `pubspec.yaml`      | `lib/`                        |
| `Cargo.toml`        | `src/`                        |
| `pyproject.toml` / `setup.py` | `src/`, `app/`, or the package name dir |
| `package.json` / `tsconfig.json` | `src/`, `server/`, `web/`, `app/` |
| None of the above   | Top-level non-hidden dirs, excluding `node_modules`, `.git`, `dist`, `build`, `target`, `vendor`, `.venv`, `coverage`, `__pycache__`, `.dart_tool` |

Cap at **~100 source files** and **~5 000 lines total** across all
files. Read largest files first (use Bash `find + wc` to rank).

### Step 3 — Identify capabilities

From the docs and code sample, identify **3–8 distinct capability
areas** (feature surfaces visible to the user or clearly named in
the code). Examples: `sql-editor`, `database-connections`,
`query-results`, `user-auth`.

### Step 4 — Scaffold

Run `openspec init` at the project root to create the `openspec/`
scaffold:

```bash
npx openspec init
```

(This is a one-time scaffold; idempotent if `openspec/` already exists —
but preflight in step 1 should have caught that.)

### Step 5 — Write capability specs

For each capability you identified, write
`openspec/specs/<capability>/spec.md` using **exactly** this format:

```markdown
## Purpose

<One sentence describing what this capability does for the user.>

## Requirements

### Requirement: <Name>

The system SHALL <verb> <what>.

#### Scenario: <Name>

- **GIVEN** <context>
- **WHEN** <action>
- **THEN** <outcome>
```

Every capability MUST have at least 1 Requirement.
Every Requirement MUST have at least 1 Scenario.

Run `npx openspec validate --all --strict` after writing the specs and
fix any formatting errors it reports before proceeding.

### Step 6 — Write the completion marker

Write `openspec/GENERATED.md` at the project root with exactly this
shape:

```markdown
# OpenSpec — LLM-Generated Draft

> These specs were auto-generated by ithyno on <ISO 8601 timestamp>.
> They are a **starting point only** — review, edit, and archive each
> capability through the normal OpenSpec workflow before relying on them.

## Generated capabilities

- [<capability-name>](openspec/specs/<capability-name>/spec.md)
  (one bullet per capability)
```

The presence of `openspec/GENERATED.md` is the signal ithyno's server
watches to trigger the dashboard transition. Write it LAST, after all
`spec.md` files are already on disk.

### Step 7 — No commit

**DO NOT run `git add`, `git commit`, or any git write command.**
Leave `openspec/` files untracked. The user reviews and commits
manually.

### Step 8 — Return summary

In your **final message**, output exactly one JSON blob on its own
line (so Manager can parse it):

```json
{ "capabilities": ["<cap1>", "<cap2>", ...], "notes": "<what you observed about the project>" }
```

Then stop. Do not ask follow-up questions.
```

---

## Guardrails

- **DO NOT commit.** The sub-agent's boot prompt says so; enforce it
  here too. If the sub-agent attempts to commit, that is a bug in the
  prompt — report it in the summary notes.
- **DO NOT flood Manager's context** with the sub-agent's individual
  Read/Grep/Bash calls. The Task tool isolates sub-agent I/O; only
  the final return message reaches Manager.
- **Target path isolation.** The sub-agent's CWD is set by the `cd`
  in the boot prompt. The sub-agent does NOT touch ithyno's own
  `openspec/` (the ithyno project root). Only the target's
  `openspec/` is written.
- **No agmsg required.** This skill uses the built-in Task tool;
  agmsg is not needed.
