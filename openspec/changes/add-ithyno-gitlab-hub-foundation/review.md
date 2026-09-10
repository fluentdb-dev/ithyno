---
verdict: needs-rework
summary: "Existing open merge requests are reused without reconciling their Draft state or generated content."
findings:
  - severity: high
    file: hub/src/gitlab-flow.ts
    line: 103
    message: "processIssueGenerationJob bypasses upsertMergeRequest whenever findMergeRequest returns an open MR. Consequently an existing non-Draft or stale open MR is returned unchanged, violating the requirement to open or update one Draft MR and to reconcile canonical resources on retry. Always route the canonical open MR through reconciliation (or explicitly update it), and add a regression test proving an existing open non-Draft/stale MR is updated without creating a second MR."
---

## Notes

Manager review after commit `ff8f97c`. The prior note endpoint, redirect/token redaction, protocol validation, and cross-origin array payload findings are resolved. Hub typecheck and the focused 29-test suite pass; localhost integration tests required running outside the sandbox and passed there.
