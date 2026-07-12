---
name: opsx-revert
description: The Claude-driven "open a revert change" flow for OpenSpec UI. Runs when the user invokes `/opsx:revert <scope>`. Handles preflight → target picking → Case α/β classification → openspec new + skeleton generation → PENDING annotation injection into current specs → REVERTED annotation injection into Case α archives → validate. Never commits, never archives, never touches git.
---

# `/opsx:revert <scope>` — open a revert change with annotations enforced

This skill is the recipe Claude runs when the user asks to open a
revert. It bakes the Revert workflow's `PENDING` and `REVERTED`
annotation conventions into a scripted checklist so no annotation
can be forgotten.

Landed by `add-opsx-revert-command`.

## When Claude runs this

- User types `/opsx:revert <scope>` (the slash command entry lives at
  `.claude/commands/opsx/revert.md`).
- User asks in natural language to open a revert change (e.g., "let's
  revert the escalation UX").

## What this skill DOES

- Runs `openspec new change revert-<scope>` and populates the scaffold.
- Inserts PENDING annotations directly under the affected
  `### Requirement:` headings in the current
  `openspec/specs/<capability>/spec.md`.
- Inserts REVERTED annotations at the top of each Case α archived
  target's `proposal.md`.
- For Case β targets, follows the Reverted-target archive procedure
  documented in `.claude/skills/openspec-flow/SKILL.md`.
- Runs `openspec validate` and reports the outcome.

## What this skill does NOT do

- No `git add`, `git commit`, `git push`. The revert change moves to
  archive later through `/opsx:apply` + `/ithy-opsx:archive` like any
  other change.
- No `openspec archive` for the revert change itself.
- No merge into `main`. That's a separate decision.
- No destructive git actions on the current worktree.

## Steps

### 1. Preflight

1. **Repo state**. Run `git status --porcelain`. If dirty in a way
   that would collide with the scaffold write (e.g., an existing
   `openspec/changes/revert-<scope>/` directory), stop and report.
2. **Git identity**. Verify `git config user.name` and `user.email`
   resolve. Not strictly required here (we do no commits) but the
   downstream `/opsx:apply` needs them and it's cheaper to catch now.
3. **OpenSpec CLI**. Run `npm run openspec -- list` to confirm the
   CLI works.
4. **Scope argument**. If the invoker passed `<scope>` after
   `/opsx:revert`, use it. Otherwise, use the **AskUserQuestion tool**
   (open-ended) to ask:
   > "What behavior are you reverting? A short kebab-case scope
   > (e.g., `kanban-ui-lanes`), or a description I'll convert."

   Derive a kebab-case scope. Validate it (`^[a-z0-9-]+$`, no
   leading / trailing hyphens). If invalid, ask again.

### 2. Discover targets

1. **Enumerate archived changes**:
   ```
   ls openspec/changes/archive/ | sort
   ```
2. **Enumerate active (in-flight) changes**:
   ```
   ls openspec/changes/ | grep -v '^archive$'
   ```
3. **Enumerate current landed requirements**:
   ```
   grep -n "^### Requirement" openspec/specs/*/spec.md
   ```
4. Use **AskUserQuestion tool** to let the user pick target(s). Present
   candidates in the format `<capability>::<requirement name>` so a
   user can pick multiple at once. Multi-select allowed.
5. For each picked requirement, resolve which change originally added
   it. Grep the archived proposals + current active proposals for the
   requirement name to find the origin:
   ```
   grep -rln "### Requirement: <name>" openspec/changes/
   ```
   If multiple origins are found (which happens when a requirement was
   MODIFIED), show the chain and pick the most recent authoritative
   one.

### 3. Classify Case α / Case β

- **Case α** — the target's origin lives in `openspec/changes/archive/`
  (its ADDED delta has already reached `openspec/specs/<capability>/spec.md`).
  The revert delta will use `## REMOVED Requirements` or
  `## MODIFIED Requirements`.
- **Case β** — the target's origin still lives in
  `openspec/changes/<target>/` (in-flight; ADDED delta hasn't reached
  the spec yet). The revert delta uses `## ADDED Requirements`
  describing the post-revert baseline, and the target itself is
  archived alongside the revert per the Reverted-target archive
  procedure.

Record each target's classification for the proposal.

### 4. Scaffold the revert change

1. Confirm with the user:
   > "About to create `openspec/changes/revert-<scope>/` with
   > <N> targets: <list>. Proceed?"
2. On yes:
   ```
   npm run openspec -- new change revert-<scope>
   ```

### 5. Populate `proposal.md`

Write `openspec/changes/revert-<scope>/proposal.md` with this shape:

```md
---
tags: [feature/revert, area/<primary-area>, <scope-tokens...>]
---

# <Human-readable title, e.g. "Revert kanban UI phase lanes">

## Why

<Narrative: what principle / evidence surfaced that the target should
be reverted? Cite the conversation, the surfaced issue, or the
convention violation. Keep it factual — this is history.>

## Targets

All <Case α | Case β | mixed>.

1. **`<target-id>`** (`<archive-date-target-id>`, Case <α|β>):
   <one-sentence effect on the revert change — full? partial? which
   requirements?>

2. **`<target-id>`** ...

## What Changes

### Spec (<REMOVED|MODIFIED|ADDED> — <N> requirements)

- `<Requirement Name>`
- `<Requirement Name>`

### Impl

<one-line-per-file changes needed to undo the impl portion of the
targets>

## Case α revert validity  (or "Case β revert validity")

<one-paragraph justification per the openspec-flow skill's Revert
section>

## Blast radius

<one-paragraph>

## Out of scope

<one-paragraph>
```

Fill in each `<...>` from the user's input during target collection.

### 6. Populate delta `specs/<capability>/spec.md`

For every capability that owns at least one targeted requirement,
create `openspec/changes/revert-<scope>/specs/<capability>/spec.md`
with the appropriate delta headers.

**Case α template**:

```md
# Delta: <capability> — <one-line intent>

## REMOVED Requirements

### Requirement: <Requirement Name>

**Reason**: <one-sentence why this requirement is being removed>.

**Migration**: <what users / other agents should know about how the
system behaves post-revert>.

### Requirement: <Requirement Name>

...
```

For MODIFIED requirements (Case α), use `## MODIFIED Requirements`
and rewrite the requirement body directly. Include
`#### Scenario:` blocks to keep the change valid.

**Case β template**:

```md
# Delta: <capability> — <one-line intent>

## ADDED Requirements

### Requirement: <Post-revert requirement name>

<Describe the state the system should be in after the revert. This
is essentially the baseline that existed BEFORE the target's ADDED
requirement was proposed.>

#### Scenario: <name>
- **GIVEN** ...
- **WHEN** ...
- **THEN** ...
```

### 7. Populate `tasks.md`

Write a standard revert checklist. Include:

```md
## 1. Spec deltas

- [ ] 1.1 <N> <REMOVED|MODIFIED|ADDED> requirements in specs/<capability>/spec.md
- [ ] 1.2 `npm run openspec -- validate revert-<scope>` VALID

## 2. Impl reverts

- [ ] 2.1 <file>: <what to revert>
- [ ] 2.2 ...

## 3. Test updates

- [ ] 3.1 <test file>: <what changes>

## 4. Target archive annotations

- [ ] 4.1 Annotated `openspec/changes/archive/<archive-date-target-id>/proposal.md` with REVERTED note (Case α)
- [ ] 4.2 ...

## 5. In-flight spec 注記

- [ ] 5.1 PENDING <REMOVAL|MODIFICATION> annotation on <N> target requirements in openspec/specs/<capability>/spec.md
- [ ] 5.2 (auto-inserted by /opsx:revert; verify by inspection)

## 6. Case β target archive procedure (if applicable)

- [ ] 6.1 Rewrote openspec/changes/<target>/outcome.md to point at revert-<scope>
- [ ] 6.2 Deleted openspec/changes/<target>/specs/
- [ ] 6.3 `openspec archive <target> --yes` invoked BEFORE archiving the revert itself

## 7. Verification

- [ ] 7.1 `npm test && npm run typecheck && npm run build` clean

## 8. Post-impl

- [ ] 8.1 phase-workflow へ merge (worktree flow)
- [ ] 8.2 archive → phase-workflow に archive commit
```

### 8. Insert PENDING annotations into current specs

For each targeted requirement in `openspec/specs/<capability>/spec.md`,
insert immediately under the `### Requirement:` heading:

```md
### Requirement: <name>

> ⚠️ **PENDING <REMOVAL|MODIFICATION>** by [revert-<scope>](../../changes/revert-<scope>/): <one-line reason>.

<existing body — untouched>
```

- Case α + REMOVED delta → `PENDING REMOVAL`
- Case α + MODIFIED delta → `PENDING MODIFICATION`
- Case β → skip (no landed spec to annotate)

The annotation is auto-cleaned by `openspec archive` when the revert
lands: REMOVED requirements disappear entirely; MODIFIED requirements
get their body replaced from the delta.

### 9. Insert REVERTED annotations into Case α target archives

For each Case α target, insert at the top of
`openspec/changes/archive/<archive-date-target-id>/proposal.md`,
immediately after the closing frontmatter delimiter:

```md
---
tags: [...]
---

> **<REVERTED|PARTIALLY REVERTED>** by [revert-<scope>](../<archive-date-revert-<scope>>/) — <one-sentence reason>.

<original body>
```

- Use `REVERTED` when every requirement the target ADDED is being
  removed / modified.
- Use `PARTIALLY REVERTED` when only a subset is affected. Include a
  short list of what stays vs what goes.

### 10. Case β — reverted-target archive procedure

For each Case β target:

1. **Delete** `openspec/changes/<target>/specs/`. Its ADDED deltas
   would collide with the revert's own baseline in the capability
   spec if applied.
2. **Rewrite** `openspec/changes/<target>/outcome.md`:
   - Title: `# Outcome: <target-id> (reverted)`
   - Preserve `## ✅ Worked` and `## ⚠️ Surprises` from the actual
     implementation if it exists.
   - Replace / add `**Reverted by [revert-<scope>](../archive/<archive-date-revert-<scope>>/).**`
3. Do NOT run `openspec archive <target>` here. That's a separate
   step — the user runs it before archiving the revert itself.
4. Note the ordering requirement prominently in the report at step 12:
   "Archive `<target>` BEFORE archiving `revert-<scope>`."

### 11. Validate

```
npm run openspec -- validate revert-<scope>
```

If NOT VALID:
- Show the error to the user.
- Do NOT roll back the annotations or scaffold — the user will fix
  the delta by hand and re-validate.
- Stop; do not proceed to the report.

### 12. Report

Tell the user:

- The revert change id: `revert-<scope>`.
- The location: `openspec/changes/revert-<scope>/`.
- The number of PENDING annotations inserted (and where).
- The number of REVERTED annotations inserted (and where).
- Case β targets that need `openspec archive <target-id>` BEFORE
  archiving the revert.
- Next step: `/opsx:apply revert-<scope>` to implement the code /
  test changes, then `/ithy-opsx:archive revert-<scope>` when done.

## When something goes wrong

- **`openspec new change` fails**: report the error, stop. No files
  have been touched yet.
- **PENDING annotation insertion fails** (e.g., requirement heading
  can't be located): report the affected requirement to the user;
  they insert by hand and continue.
- **`openspec validate` fails**: leave everything in place, report the
  error, let the user fix.

## See also

- `.claude/skills/openspec-flow/SKILL.md` — the broader Revert section
  this skill enforces.
- `CLAUDE.md` — the `## In-flight spec 注記` hard rule this skill
  bakes into tooling.
