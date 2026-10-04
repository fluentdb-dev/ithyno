## Outcome

Windows Electron can run and render Copilot's full-screen terminal, navigate
its timeline, and invoke OpenSpec-native Skills. Copilot notification hooks are
installed with normal permission handling intact. Dispatch and dispatch-multi
now require the complete current change definition in every worktree before a
worker starts.

## Verification

- TypeScript typecheck passed.
- Full test suite passed: 1115 tests, 6 skipped.
- Production Vite build passed.
- Strict OpenSpec validation passed.
- Windows Electron and Copilot behavior was confirmed interactively.
