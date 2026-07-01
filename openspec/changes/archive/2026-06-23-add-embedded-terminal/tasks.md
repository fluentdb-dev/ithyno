## 1. Cross-platform Path Fix (prerequisite)
- [x] 1.1 Rewrite changeIdForPath using path.relative + path.sep
- [x] 1.2 Add unit tests for POSIX and Windows-style paths

## 2. PTY Backend
- [x] 2.1 Add node-pty (prebuilt-bundling variant) and @xterm/xterm dependencies
- [x] 2.2 Create server/sync/pty.ts: spawn a PTY with cwd = project root
- [x] 2.3 Select shell by platform (pwsh/powershell on Windows, $SHELL/bash on POSIX)
- [x] 2.4 Bridge stdin/stdout over a dedicated /pty WebSocket, with a resize control message
- [x] 2.5 Refuse the /pty upgrade for non-localhost connections

## 3. Feature Detection & Health
- [x] 3.1 Load node-pty lazily; tolerate a load failure
- [x] 3.2 Report terminal availability in /api/health

## 4. Terminal UI
- [x] 4.1 Add web/src/components/Terminal.tsx using xterm.js over the /pty socket
- [x] 4.2 Handle terminal resize (fit addon) and forward dimensions to the server
- [x] 4.3 Hide the terminal pane when the backend reports it unavailable

## 5. Layout & Integration
- [x] 5.1 Add a split layout pairing the terminal with the kanban / tasks
- [x] 5.2 Verify a terminal edit to tasks.md updates the kanban live via the watcher

## 6. Docs
- [x] 6.1 Document the Windows/WSL "same environment" requirement in the README
- [x] 6.2 Document that the terminal is local-only and how to configure the launch command
