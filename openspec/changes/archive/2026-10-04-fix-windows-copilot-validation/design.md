## Context

Copilot uses an alternate-screen terminal UI and now discovers native Agent
Skills under `.github/skills`. Windows notification hooks use PowerShell while
repository hook configuration remains cross-platform. Worktrees are created
from `HEAD`, so pending OpenSpec artifacts must be copied explicitly.

## Goals / Non-Goals

**Goals:**

- Preserve Copilot's terminal control sequences through the production bundle.
- Use OpenSpec-native Copilot Skill identifiers.
- Keep notification hooks portable and permission-safe.
- Guarantee workers receive the current change contract.

**Non-Goals:**

- Automatically grant Copilot tool permissions.
- Change non-Copilot command naming.
- Archive multiple changes automatically.

## Decisions

- Disable Vite minification because a second minification pass breaks xterm's
  request-mode handler.
- Translate Copilot wheel input to terminal PageUp/PageDown only for the Copilot
  alternate-screen title when mouse tracking is disabled.
- Map upstream commands to `/openspec-*` native Skill names while retaining
  `/ithy-opsx-*` for ithyno-specific workflows.
- Configure both `notification` and `preToolUse`; the latter returns an empty
  decision object so Copilot's normal permission flow remains authoritative.
- After `git worktree add`, copy the entire matching change directory and verify
  `proposal.md` and `tasks.md` before dispatch.

## Risks / Trade-offs

- Disabling minification increases packaged JavaScript size.
- Pre-tool notifications can be frequent, but are explicitly enabled by policy.
- Copying pending change artifacts makes them dirty in the worker branch by
  design so they are committed with the implementation.

