# Delta: dashboard — error display convention

## ADDED Requirements

### Requirement: Error Display Convention

The dashboard SHALL surface errors through exactly three visual
categories, each with a dedicated CSS class:

1. **Async-action errors** — transient toasts anchored bottom-right.
   Displayed via `pushToast("error", <message>)`. Rendered as
   `.toast.error` (already exists; no rename). Auto-dismissed on
   click. Used for: Start button prerequisites, inject failures,
   lock-held gates, per-action failure messages.

2. **Load-time / server errors** — persistent inline banners.
   Rendered as `<div className="parse-error">⚠ <message></div>`.
   Used for: initial state load failure, `agents.yaml` parse
   error, `spec.md` parse error, diff-view load failure,
   modal-level server-returned errors. The markup convention
   (`<div>`, leading `⚠`, single class) SHALL be uniform — no
   `<p>` variants, no bare non-icon banners.

3. **Form-field validation** — inline text under the invalid
   input. Rendered as `.form-field-error`. Used for: any form
   input that fails client-side validation. All modals SHALL
   share this class — no per-modal variants like `.field-error`
   or `.agent-config-error`.

Any error message that appears at 2+ call sites SHALL be exported
as a constant from `web/src/lib/errorMessages.ts` (the `ERR`
object). Call sites SHALL reference the constant rather than
hard-coding the string, to prevent wording drift.

#### Scenario: async failure uses toast
- **GIVEN** a Start button click when the lock is held by another change
- **WHEN** the failure surfaces
- **THEN** a `.toast.error` appears bottom-right with the shared `ERR.LOCK_HELD(<change>)` message; the underlying flow does not open a modal

#### Scenario: load error uses parse-error banner
- **GIVEN** `agents.yaml` fails to parse
- **WHEN** the Agents tab renders
- **THEN** a `<div class="parse-error">⚠ agents.yaml: <details></div>` appears inline; no toast is used for the load-time error

#### Scenario: form validation uses form-field-error
- **GIVEN** the user submits AgentConfigModal with a blank `command` field
- **WHEN** the modal renders validation feedback
- **THEN** a `.form-field-error` element appears under the `command` input; `.field-error` and `.agent-config-error` classes are NOT used

#### Scenario: duplicated message uses ERR constant
- **GIVEN** two or more call sites need the same error text
- **WHEN** both refer to the message
- **THEN** they import the same constant from `web/src/lib/errorMessages.ts`; neither hard-codes the string

#### Scenario: modal server error banner
- **GIVEN** AgentConfigModal receives a server-side error on save
- **WHEN** the modal renders the failure
- **THEN** a `<div class="parse-error">⚠ <error></div>` appears; the deprecated `.agent-config-server-error` class is NOT used
