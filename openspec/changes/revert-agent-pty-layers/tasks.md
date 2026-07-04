## 1. Server: agent runner back to piped stdio

- [x] 1.1 `server/agents/runner.ts`: remove the `loadPty()` call and PTY-spawn branch; replace with `child_process.spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] })`
- [x] 1.2 Wire `child.stdout.on("data")` and `child.stderr.on("data")` to `pushOutput` + `agent-job-output` broadcast (same event type, `stream: "stdout" | "stderr"`)
- [x] 1.3 Remove `AgentRunner.writeInput()` and its supporting internals
- [x] 1.4 Remove the `IPty` type shim + the "roll back the worktree we just created" branch that only fired on PTY-unavailable
- [x] 1.5 Preserve worktree creation / lock / job registry / SIGTERM-on-shutdown behavior — those live in the base runner, not the PTY layer

## 2. Server: agent input endpoint removed

- [x] 2.1 `server/index.ts`: delete the `fastify.post<... InputBody>("/api/agents/jobs/:id/input", …)` route
- [x] 2.2 Delete the associated request-body type and any auth extractor branches only used by that route
- [x] 2.3 Grep the codebase for `writeInput` / `/api/agents/jobs/.*/input` and confirm no callers remain

## 3. Server: initialInput → `-p` composition

- [x] 3.1 Locate where `agents.yaml` is parsed and where `resolved.args` is built (server/agents/registry.ts or equivalent)
- [x] 3.2 When an agent def carries `initialInput` and its resolved args do NOT already contain `-p`, prepend `["-p", initialInput]` to the args at spawn time
- [x] 3.3 If the agent def's args already contain `-p` (custom), leave them alone — user knows better
- [x] 3.4 Update `agents.yaml.example`: bundled Claude agent uses `args: ["-p", "$initialInput"]`, with a comment explaining the non-interactive contract

## 3.5 Server: echo spawn command line in transcript

- [x] 3.5.1 In `runner.ts` right after `spawnChild`, push one synthetic `stdout` line containing `$ <command> <shell-quoted args>\n\n` and emit it via `agent-job-output`
- [x] 3.5.2 Small POSIX-style `quoteArg` helper — only-for-display quoting, not re-executable
- [x] 3.5.3 Rationale (`-p` mode buffers output; user sees nothing until completion → at least the "what was launched" is visible from t=0)

## 3.6 Client: Cancelling… button state

- [x] 3.6.1 `web/src/pages/Agents.tsx::JobRow`: add a local `cancelling: boolean` state
- [x] 3.6.2 On Cancel click: flip `cancelling` to `true`, then call `cancelAgentJob(job.id)`; on rejection, flip back to `false`
- [x] 3.6.3 While `cancelling` is true, the button is `disabled` and its label reads `Cancelling…`
- [x] 3.6.4 The WS `agent-job-finished` event flips `job.status` off `running`, which unmounts the button entirely via its existing `job.status === "running"` guard — no explicit clear-cancelling needed

## 4. Client: replace xterm.js AgentOutputView with `<pre>` + ansi-to-html

- [x] 4.1 Delete `web/src/components/AgentOutputView.tsx`
- [x] 4.2 In the Agents page (or wherever the job output is rendered), replace the `<AgentOutputView …>` mount with a scrolling `<pre>` bound to the job's ring buffer
- [x] 4.3 Route the ring buffer through a small `ansi-to-html` helper (existing library, e.g. `ansi_up` or inline ~30 LOC) so SGR color codes render as `<span>` with inline color styles; strip cursor-motion codes (no-op — `-p` doesn't emit them, but be defensive)
- [x] 4.4 Ensure the tail auto-scrolls on new bytes; ensure a "Copy" affordance still works (it did on the old xterm.js; make sure it still does on `<pre>`)

## 5. Client: remove Job Input field

- [x] 5.1 Delete the input `<textarea>` / `<input>` in the Agents page that posted to `/api/agents/jobs/:id/input`
- [x] 5.2 Delete the `writeAgentInput` (or equivalent) helper in `web/src/api.ts`
- [x] 5.3 Delete any related component state and the `[stdin] …` echoing in the transcript

## 6. Archive the reverted upstream changes

For each of `add-agent-pty-runner`, `add-agent-xterm-output`,
`add-agent-stdin-relay`:

- [ ] 6.1 Draft an outcome that says "landed → reverted by revert-agent-pty-layers"; keep the "What worked / surprises" from the actual implementation so the history is honest, but the Follow-ups section points at THIS change
- [ ] 6.2 `openspec archive <id>` to move files into `openspec/changes/archive/`
- [ ] 6.3 Verify the resulting spec delta (via this change's own delta) neutralises the PTY / xterm / stdin behaviors those changes added to `agent-runner`

## 7. Spec delta

- [x] 7.1 `openspec/changes/revert-agent-pty-layers/specs/agent-runner/spec.md`: MODIFIED / REMOVED requirements covering (a) piped-stdio spawn as the single path, (b) removal of the `/api/agents/jobs/:id/input` endpoint, (c) `initialInput → -p` translation

## 8. Docs

- [ ] 8.1 `docs/architecture/parallel-shells.md` (if it covers agent output): update the "how agents run" paragraph
- [ ] 8.2 Root README: if it references the PTY-based agent runner or the input field, update

## 9. Verification

- [x] 9.1 `npm test && npm run typecheck && npm run build` all green after the revert
- [x] 9.2 Start an agent (bundled Claude) via the Kanban Run button; agent runs non-interactively (`-p "<initialInput>"`) and prints plain lines
- [x] 9.3 Agents page transcript shows the output as `<pre>` + colored spans; no `\x1b[…` literal escapes visible
- [ ] 9.4 Agent completes and status flips to `completed`; tasks.md ticks in the worktree land as expected
- [ ] 9.5 Confirm `POST /api/agents/jobs/:id/input` returns 404 (route removed) — direct curl check
- [x] 9.6 Confirm the embedded terminal at ChangeDetail (user-facing xterm.js) still works — that path is untouched
- [ ] 9.7 `add-agent-pty-runner`, `add-agent-xterm-output`, `add-agent-stdin-relay` are visible under `openspec/changes/archive/` with outcomes noting the revert
