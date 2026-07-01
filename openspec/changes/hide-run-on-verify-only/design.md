## Context

`add-kanban-view` shipped the Run button with a coarse gate: any TODO or
IN-PROGRESS card shows it. The kanban's column derivation is purely
progress-based and has no notion of "what kind of work is left." The
remaining state lives in the parsed `tasks.md` sections, which the change
payload already carries.

## Goals / Non-Goals

**Goals:**
- Hide Run when the agent has nothing it can act on (verification-only
  remaining).
- Show a small replacement hint so the user knows why Run vanished.

**Non-Goals:**
- A general "task type" system. We are not adding `type: code | docs |
  verify | manual` to the tasks.md schema. That belongs to a future change
  if it earns its complexity.
- Filtering tasks by type elsewhere (Tasks view, Archive, etc.). Scope
  stays on the Run button.
- Changing the column placement of verify-only changes. They stay in
  IN-PROGRESS until all tasks check; that's still the source of truth.

## Decisions

### Detection

A section is a verification section iff its title (the markdown heading
text after stripping numbering) contains the substring `"verif"`
case-insensitively. That covers `Verification`, `Verify`, `Verification
(manual)`, etc. We do not list other matches (`Manual`, `QA`, …) because
the project convention is consistently "Verification."

### Predicate

```ts
function hasNonVerifyWork(tasks: TaskList | null): boolean {
  if (!tasks) return true; // no tasks parsed → permit Run
  for (const sec of tasks.sections) {
    const verifySection = sec.title.toLowerCase().includes("verif");
    for (const t of sec.tasks) {
      if (!t.checked && !verifySection) return true;
    }
  }
  return false;
}
```

Used only as a gate on the Run button; nothing else consumes it.

### Replacement hint

When suppressed, the card shows `verify only` as muted text where the Run
button would have been. Clicking does nothing — it is not a button. The
hint is intentionally small (status indicator, not a call to action).

### Why not server-side

The information needed (section titles + checked state per task) is
already in the `Change.tasks` payload the client receives. Adding a
derived boolean server-side would duplicate logic for no benefit. Client
computes once per card render.

## Risks / Trade-offs

- **False suppression for projects with non-standard section names.** A
  change whose remaining work is named `## 9. QA pass` would not be
  detected as verify-only, and Run would still appear. Acceptable;
  projects can rename to follow the convention, and the rule is
  conservative (errs toward showing Run).
- **Mixed sections.** A section literally named `## 9. Docs + Verification`
  would be treated as verification-only. The convention separates them;
  we trust the convention.
- **No tooltip.** The "verify only" hint does not explain *which* tasks
  are left. Future refinement could expand it on hover; v1 keeps it tiny.
