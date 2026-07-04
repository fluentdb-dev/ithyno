## 1. Runner: replace `child_process.spawn` with `node-pty`

- [x] 1.1 Import `loadPty` from `server/sync/pty.ts` in `server/agents/runner.ts`; drop the `child_process.spawn` import for the runner (leave `execFile` for `git worktree add`)
- [x] 1.2 In `run()`, `await loadPty()`; if unavailable, roll back the newly-created worktree and return `{ ok: false, status: 500, reason: <pty error> }`
- [x] 1.3 Replace `spawn(...)` with `pty.module.spawn(def.command, resolved.args, { name: "xterm-256color", cwd: worktreePath, env: { ..., TERM: "xterm-256color" }, cols: 200, rows: 50 })`
- [x] 1.4 Change `processes: Map<string, ChildProcess>` to `Map<string, IPty>` — a structural type so we don't couple to the native binding's typings
- [x] 1.5 Wire `term.onData((data) => …)`: push `{ stream: "stdout", chunk: data, ts: Date.now() }` and emit `agent-job-output` accordingly; drop the two-stream `handleChunk` helper
- [x] 1.6 Wire `term.onExit(({ exitCode, signal }) => …)`: map SIGTERM (signal 15) with running-status → `cancelled`, exit 0 → `completed`, otherwise → `crashed`

## 2. Runner: writeInput + initialInput onto the pty

- [x] 2.1 In `writeInput`, replace `proc.stdin.write(bytes)` with `term.write(bytes)`; append `\r` (was `\n`) when `appendNewline` is true
- [x] 2.2 In the `initialInput` block, replace the stdin write with `term.write(bytes)`; append `\r` when the value ends with neither `\r` nor `\n`
- [x] 2.3 Echo entry in the ring buffer and WS broadcast match the actual bytes written (unchanged in shape)

## 3. Runner: cancel + shutdown

- [x] 3.1 `cancel()` and `shutdown()` continue to call `.kill("SIGTERM")` — same call name on IPty; underlying implementation differs
- [x] 3.2 Pre-set `job.status = "cancelled"` before killing so onExit handler doesn't overwrite it (unchanged)

## 4. Tests

- [x] 4.1 Updated `server/agents/runner-input.test.ts`: fake writable → fake IPty stub with `.write` / `.kill` / `.onData` / `.onExit`
- [x] 4.2 Test that `writeInput` appends `\r` (not `\n`) with `appendNewline: true`
- [x] 4.3 Added a test that `cancel()` calls `.kill("SIGTERM")` on the pty stub
- [x] 4.4 `server/agents/registry-initial-input.test.ts` — no changes needed (template-resolve is runner-agnostic)

## 5. Docs

- [x] 5.1 `docs/architecture/parallel-shells.md` — new "Agents run inside a PTY" section
- [x] 5.2 `agents.yaml.example` — note that agents run inside a pty; suggest omitting `-p` / `--headless` flags whose only purpose was TTY workarounds

## 6. Verification

- [ ] 6.1 Restart the server (`dev:test`), Start `add-vscode-extension` under Worktree mode
- [ ] 6.2 Agents page shows the initial `[stdin] /opsx:apply add-vscode-extension` line, followed by Claude's normal REPL output (colors, spinners, prompt drawings)
- [ ] 6.3 Permission prompt from Claude appears in the transcript; type a response in the input field, press Enter, agent continues
- [ ] 6.4 Cancel a running agent from the UI; the pty is killed, status flips to `cancelled`, worktree cleanup path (Discard) still works
- [ ] 6.5 An agent with no `initialInput` (e.g. `node script.js` style) still runs; no crash, no unexpected write
- [ ] 6.6 `agents.yaml` reload picks up a new agent definition and future starts use it (regression check on the reload path)
