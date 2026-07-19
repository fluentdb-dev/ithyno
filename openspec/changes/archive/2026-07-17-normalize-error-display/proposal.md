---
tags: [feature/ui, area/web, refactor, error-handling, consistency]
---

# Normalize error display (CSS classes + message constants)

## Why

Error display is functionally split across three semantic categories
(async-action toast, load-time banner, form-field inline), each of
which is correct in its own right. But the **implementation of those
categories is fragmented** — the same category is realized with
different CSS classes and slightly different markup at different call
sites. Concretely:

- **Load-time banners** appear as either `<p className="parse-error">`
  (App.tsx) or `<div className="parse-error">⚠ ...</div>` (Agents,
  DiffView, TaskTree, SpecView). Same CSS class, different tag +
  ⚠ prefix.
- **Form-field validation** uses **two classes** for the same intent:
  `.field-error` (CommandModal) vs `.agent-config-error`
  (AgentConfigModal). Two rules that render nearly identical output.
- **Server-side errors in modals** use a third class,
  `.agent-config-server-error`, that essentially duplicates the
  parse-error banner shape.

Toasts, on the other hand, are already unified via
`pushToast("error", msg)` and the `.toast.error` component — no work
needed there.

The **wording** of common errors is also duplicated by copy-paste
across files. For example, four different variants of "No terminal
open" ship today across `useStartFlow.tsx`, `Kanban.tsx`,
`Overview.tsx`, and `ChangeDetail.tsx`. Users who hit this see three
subtly different messages depending on how they clicked.

## What Changes

### 1. Consolidate CSS classes

`web/src/styles.css`:

- **Keep** `.parse-error` as the canonical **inline banner** for
  load-time errors. Standardize its expected markup: `<div
  className="parse-error">⚠ &lt;message&gt;</div>` (always div,
  always with ⚠ prefix).
- **Delete** `.field-error` and `.agent-config-error`. Introduce
  `.form-field-error` as the single form-input inline error class.
- **Delete** `.agent-config-server-error`. Modal-level server errors
  reuse `.parse-error` (same styling; same semantic — a load-time /
  server-side failure surface).

### 2. Extract error message constants

`web/src/lib/errorMessages.ts` (new):

```ts
export const ERR = {
  NO_TERMINAL: "No terminal — open a change view to spawn one.",
  INJECT_FAILED: "Inject failed.",
  LOCK_HELD: (change: string) =>
    `Change ${change} is currently running. Merge or discard it first.`,
  // ... any other commonly-duplicated messages
};
```

Call sites that currently hard-code these strings switch to `ERR.
NO_TERMINAL` etc. Removes four "No terminal" variants and any other
copy-paste drift.

### 3. Update call sites to new classes / constants

- `web/src/hooks/useStartFlow.tsx`: use `ERR.NO_TERMINAL`,
  `ERR.LOCK_HELD`, `ERR.INJECT_FAILED`.
- `web/src/components/Kanban.tsx`: same for its own toast strings.
- `web/src/pages/{Overview,ChangeDetail,Settings,Agents}.tsx`: same
  for shared error strings.
- `web/src/App.tsx`: switch load-error paragraph to
  `<div className="parse-error">⚠ Failed to load: {error}</div>`.
- `web/src/components/CommandModal.tsx`: replace `.field-error` with
  `.form-field-error`.
- `web/src/components/AgentConfigModal.tsx`: replace
  `.agent-config-error` (inline) with `.form-field-error`; replace
  `.agent-config-server-error` (banner) with `.parse-error` markup.

### 4. No behavior change

Toast mechanism, load-time banner mechanism, form validation
mechanism all stay. This change is purely a **presentation +
authorship consistency** cleanup. No API changes, no user-facing
behavior differences beyond seeing the same message everywhere
instead of near-duplicates.

## Impact

- **Affected specs**: none (existing spec doesn't gate error markup
  at this granularity)
- **Affected code**:
  - `web/src/styles.css` (delete 3 classes, keep + document
    `.parse-error`, add `.form-field-error`)
  - `web/src/lib/errorMessages.ts` (new)
  - `web/src/App.tsx`
  - `web/src/components/{Kanban,CommandModal,AgentConfigModal}.tsx`
  - `web/src/pages/{Overview,ChangeDetail,Settings,Agents}.tsx`
  - `web/src/hooks/useStartFlow.tsx`
- **Risk**:
  - Delete-then-rename CSS: any css consumer outside our files (e.g.
    external skin) breaks. We ship the CSS ourselves; no external
    consumers. Low risk.
  - Message wording change: users see slightly-different strings
    than yesterday. Purely cosmetic — no functional regression.
- **Migration**: none. No config, no persisted state involved.
