Implement an OpenSpec change and commit the result on the current
branch.

**Input**: Optionally specify a change name after `/{{namespace}}:{{command}}`
(e.g., `/{{namespace}}:{{command}} add-auth`). If omitted, check whether it
can be inferred from conversation context; if vague or ambiguous, prompt
for the available changes.

**How to run this**

Delegate to the upstream apply command, then commit.

The flow:

1. **Preflight** — change exists, tasks.md exists, git identity is set.
2. **Delegate to the upstream apply command** — <capability:subagent_spawn>
   the upstream `/opsx:apply <id>` flow to perform the actual code changes
   and tasks.md ticks. Wait for it to report done.
3. **Porcelain check** — <capability:bash> `git status --porcelain` — is
   the tree dirty after the delegate returned?
4. **Commit (if dirty)** — <capability:file_write> to stage
   (`git add .`), draft an `agent: implement <id>` message
   (see message rules below), get user approval, run `git commit`.
5. **Report** — commit hash or "clean tree, nothing to commit."

## Commit message rules

Shape:

```
agent: implement <change-id>

<summary — one to three bullets covering the top-level tasks.md
sections that got completed, or a sentence from proposal.md's Why
section as fallback>
```

- Read `tasks.md` and note which top-level `## N. Section title` headers
  had all their items marked complete during this run.
- One bullet per completed top-level section, prefixed with `-`. If more
  than three sections completed, pick the three biggest / most meaningful
  and summarize the rest as one line.
- If nothing changed in tasks.md but files still changed, fall back to
  one sentence from `proposal.md`'s Why (first sentence, trimmed).

## Failure handling

- Do not skip the commit step when the tree is dirty.
- If pre-commit hooks fail, do NOT retry with `--no-verify`. Report the
  hook's output verbatim and stop. The user fixes and re-runs
  `/{{namespace}}:{{command}}` (or runs `git commit` manually once
  fixed).

## What this skill does NOT do

- **Merge to main.** That's `/ithy-opsx:archive`'s job.
- **Push to remote.** User pushes when ready.
- **Split into multiple commits.** One implementation, one commit.
