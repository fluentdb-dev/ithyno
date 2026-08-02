---
name: "ITHY-OPSX: Import"
description: Spawn a Task-tool sub-agent to read a target project's code and docs and produce a first-draft openspec/specs/ set, then write openspec/GENERATED.md as the completion marker.
category: Workflow
tags: [workflow, import, task-tool, ithy-opsx]
argument-hint: "<target-path>"
---

Import an existing project by generating first-draft OpenSpec specs
from its code and docs.

**Input**: `$ARGUMENTS` is the absolute path to the target project root.

**How to run this**

Follow the **`ithy-opsx-import`** skill (see
`.claude/skills/ithy-opsx-import/SKILL.md`) for target path: **$ARGUMENTS**.

The skill covers:

1. **Preflight** — verify the target path exists and `openspec/` does
   NOT already exist under it (the server already checks; this is a
   defensive guard for direct skill invocation).
2. **Spawn sub-agent** — use the Task tool (`subagent_type: "claude"`)
   with a boot prompt tailored for the import task (target path,
   no-commit rule, capability-discovery guidance, `openspec init` +
   `openspec/specs/` write instructions, `openspec/GENERATED.md`
   marker write instruction).
3. **Return summary** — output the sub-agent's JSON summary
   (`{ capabilities, notes }`) so Manager can observe completion.
