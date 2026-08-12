## 1. Tmux Session Environment

- [x] 1.1 Add explicit `-e` arguments for `ITHYNO_PORT`, `ITHYNO_BASE`, and `ITHYNO_SESSION_TOKEN` to tmux Manager startup.
- [x] 1.2 Register the three variables with tmux `update-environment` before attaching through `new-session -A`.
- [x] 1.3 Preserve CLI argument quoting, custom session names, initial-input forwarding, and token-safe startup logging.

## 2. Verification

- [x] 2.1 Add regression tests for new and existing tmux session environment propagation across Manager configurations.
- [x] 2.2 Run focused PTY/session tests, typecheck, production build, and strict OpenSpec validation.
