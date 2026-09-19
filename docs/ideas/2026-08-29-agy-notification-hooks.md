# Investigate agy notification hooks

The first CLI notification-hook implementation supports Claude Code. Agy's
project hook configuration and response-completed/awaiting-input event names
are not documented or stable enough to modify safely. Revisit this once agy
publishes a project-level hook contract; then implement the installer using the
same idempotent merge semantics as Claude's installer.
