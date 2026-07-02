## 1. Component

- [x] 1.1 New `web/src/components/AgentOutputView.tsx` — mounts `@xterm/xterm`'s `Terminal` into a container ref, applies `@xterm/addon-fit`, scrollback 10000
- [x] 1.2 On mount: fetch job via `fetchAgentJob(jobId)`; write each ring-buffer entry to the terminal in order
- [x] 1.3 Subscribe to `jobOutputs[jobId]` in the store; track `lastWrittenLen` via ref; write only the delta when the length grows
- [x] 1.4 Interactive path: `term.onData((data) => sendAgentInput(jobId, data, false))`
- [x] 1.5 `ResizeObserver` on the container → `fitAddon.fit()`; initial `fit` + one `requestAnimationFrame` (handles accordion expand timing)
- [x] 1.6 Cleanup on unmount: `term.dispose()`, disconnect ResizeObserver, `inputDisposable.dispose()`

## 2. Agents page rewire

- [x] 2.1 Replace `<JobOutput jobId />` with `<AgentOutputView jobId />` in `web/src/pages/Agents.tsx`
- [x] 2.2 Delete the `JobOutput` (pre-based) component
- [x] 2.3 Delete the `JobInputField` (textarea + Send button) component and its usage
- [x] 2.4 Remove now-unused imports (`useEffect`, `OutputLine`, `Job`, `fetchAgentJob`, `sendAgentInput` from Agents.tsx)

## 3. Styles

- [x] 3.1 Add `.agent-terminal-container` class — fixed 480px height, dark background matching the embedded terminal, `overflow: hidden` so xterm's own scrollback handles it
- [x] 3.2 Terminal fills its container (`.xterm-viewport` / `.xterm-screen` width/height 100%)
- [x] 3.3 Focus visible when clicked (`:focus-within` outline)
- [x] 3.4 Removed `.job-output`, `.out-stdout`, `.out-stderr`, `.out-stdin`, `.job-input-row` styles

## 4. Docs

- [x] 4.1 `docs/architecture/parallel-shells.md` — rewrote "Answering agent prompts from the UI" section for the interactive terminal

## 5. Verification

- [ ] 5.1 Restart the server (`dev:test`), Start `add-vscode-extension` under Worktree mode
- [ ] 5.2 Agents page shows Claude Code's REPL with correct colors, cursor drawing, no accumulated status-line residue
- [ ] 5.3 Arrow-key option prompt from Claude — press `↑` / `↓` to move the highlight, `Enter` to select, agent proceeds
- [ ] 5.4 Ctrl-C sends interrupt appropriately
- [ ] 5.5 Paste a long block of text — one HTTP call fires (visible in DevTools), the paste appears in the terminal
- [ ] 5.6 Cancel from the Kanban / job row still works
- [ ] 5.7 Reload the page mid-run — the terminal re-mounts, re-seeds from the ring buffer, live output resumes without duplicate history
