# Outcome: preserve-dashboard-dialog-input

## Worked

- Healthy focus and visibility restoration no longer recreates the dashboard
  workspace, so open dialogs and unsaved form values remain mounted.
- Recovery now distinguishes valid, unauthorized, and unavailable sessions and
  limits shell reloads to explicit authentication rejection.
- The VS Code clipboard bridge enables paste into focused fields inside the
  nested dashboard iframe while preserving native browser and Electron paste.
- Automated coverage and packaged VSIX checks passed, including manual dialog
  continuity and clipboard verification.

## Surprises

- The dialog loss was caused by unconditional workspace recovery rather than
  the dialog component itself.
- Packaged VSIX verification exposed two independent esbuild distribution
  issues: executable permissions and host/binary version alignment.

## Differently

- Test shell lifecycle and focus recovery separately from component-local form
  state whenever dialogs are hosted in embedded webviews.
- Validate clipboard behavior in the packaged extension because the nested
  iframe path differs from browser and Electron behavior.

## Follow-ups

- Keep focus recovery, authentication outcomes, and clipboard routing covered
  as separate regression contracts.
