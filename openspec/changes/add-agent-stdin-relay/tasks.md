## 1. Server: runner stdio + input endpoint

- [x] 1.1 Change `spawn(..., { stdio: ["pipe", "pipe", "pipe"] })` in `server/agents/runner.ts`
- [x] 1.2 stdin handle is obtained via `child.stdin` (kept alongside the existing process handle in the runner's `processes` map — no additional bookkeeping needed)
- [x] 1.3 New `writeInput(jobId, data, appendNewline)` method on `AgentRunner` that validates the job is running, writes to stdin, and pushes a `{ stream: "stdin", chunk }` entry into the ring buffer via the existing `pushOutput`/`emit` pair
- [x] 1.4 Handle EPIPE / write errors: map to `{ ok: false, status: 500, reason }`
- [x] 1.5 New `POST /api/agents/jobs/:id/input` endpoint in `server/index.ts` — auth-gated, local-only, 400 on missing body, 404 on unknown job, 409 on not-running, 500 on pipe failure

## 2. Types + WS payload

- [x] 2.1 `OutputLine.stream` union in `server/agents/runner.ts` and `web/src/types.ts` extended to `"stdout" | "stderr" | "stdin"`
- [x] 2.2 `agent-job-output` broadcast passes through `stream: "stdin"` (ServerEvent union in `server/index.ts` widened to match)

## 3. Web: api + store

- [x] 3.1 `sendAgentInput(jobId, data, appendNewline)` in `web/src/api.ts` using `postJson`
- [x] 3.2 No store change needed — echo lines arrive via existing `agent-job-output` handler and land in `jobOutputs[jobId]` by the same code path

## 4. Web: Agents page input field

- [x] 4.1 New `JobInputField` component rendered when `job.status === "running"` in the Output tab
- [x] 4.2 Enter submits (`appendNewline: true`) and clears; Shift-Enter inserts newline
- [x] 4.3 Disabled state with placeholder / tooltip when job is not running
- [x] 4.4 `JobOutput` renders `stream: "stdin"` lines with a distinct class (`.out-stdin`)

## 5. Styles

- [x] 5.1 `.job-input-row` — flex layout with textarea + Send button
- [x] 5.2 `.out-stdin` visual — accent color + left border, distinguishable from stdout / stderr

## 6. Docs

- [x] 6.1 `agents.yaml.example` — comment block near the top documenting `--dangerously-skip-permissions` (Claude) and `--yes-always` (Aider), plus a note that with this change users can also answer prompts from the dashboard instead
- [x] 6.2 `docs/architecture/parallel-shells.md` — new "Answering agent prompts from the UI" section above the launcher note

## 7. Tests

- [x] 7.1 `server/agents/runner-input.test.ts` — 6 cases: unknown job / not-running / newline default / newline suppressed / ring-buffer + WS echo / missing stdin
- [ ] 7.2 Server unit test on the endpoint's status codes via fastify inject — deferred to manual verification (7.3 covers behavior via the UI)
- [ ] 7.3 Web unit test on `JobInputField` — deferred (component test infra not in place)

## 8. Verification

- [ ] 8.1 Start an agent that prompts (Claude with a write into a new dir); Agents page shows the prompt in the output
- [ ] 8.2 Type a response in the input field, press Enter; response is echoed as `[stdin] …` in the transcript and the agent proceeds
- [ ] 8.3 Try sending input after the job finishes — field disabled; a bypass POST returns 409
- [ ] 8.4 Confirm YOLO fallback still works: put `--dangerously-skip-permissions` in `args`, agent never prompts, existing behavior preserved
- [ ] 8.5 Auth: `POST /api/agents/jobs/:id/input` refuses without token (401) and from a non-loopback address (403)
