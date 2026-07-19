# Design: fix-phase-3-4-review-findings

## Finding-by-finding fix plan

Ranking is by severity per the multi-angle review; all are correctness
bugs, not new capability.

### 1. `runner.ts:530` — parseReview reads projectRoot instead of worktreePath

**Fix**: change `parseReview(this.projectRoot, changeId)` to
`parseReview(worktreePath, changeId)`. The artifact scan already runs
against `worktreePath` — align.

**Test**: extend `server/agents/runner.test.ts` (create if missing) or
`review-parser.test.ts` with a fixture worktree that contains
`review.md`; assert `job.verdict` is populated after finish().

### 2. `runner.ts:572` — cancel skips finish()

**Fix**: split finish() into `finalizeJob(status, exitCode)` that runs
unconditionally on exit, regardless of prior status. If already
cancelled, honor that status in the WS event but still run the
side-effects: artifact scan, verdict parse, pool.release,
processes.delete, locks.delete, agent-job-finished emit.

Concretely: replace the current exit-handler guard

```ts
if (job.status === "running") {
  void finish(finalStatus, code);
}
```

with

```ts
const resolvedStatus = job.status === "running" ? finalStatus : job.status;
void finalize(resolvedStatus, code);
```

**Test**: dispatch a job, cancel it, assert `job.artifactPaths` is set
(possibly []), pool slot is released, and no lock remains.

### 3. `runner.ts:513` — lock released before status flip

**Fix**: move `this.locks.delete(changeId)` to the end of finalize()
(after `job.status = status`). Any concurrent `run(changeId, ...)` sees
the lock until the previous job has fully finalized.

### 4. `runner.ts:431` — Claude-specific `-p` promotion is unconditional

**Fix**: only promote `initialInput → -p arg` for runtimes whose
`promptStyle === "cli-arg"` (or, for legacy agents without a runtime,
keep the existing behavior for Claude Code compatibility). For
`promptStyle === "stdin"`:

- Do NOT unshift `-p` into args.
- Change `stdio` to `["pipe", "pipe", "pipe"]`.
- Write `resolved.initialInput` to `child.stdin`, then `end()`.

**Test**: registry-runtime.test.ts already exercises resolve(); add a
runner-level fixture that spawns `cat` as a stdin-style runtime and
asserts the child stdin receives the prompt.

### 5. `runner.ts:413` — resolve() throw leaks worktree / pool slot

**Fix**: wrap resolve() in a try that cleans up before rethrowing —
`pool.release(slot)` if pool-leased; `git worktree remove --force` and
`git branch -D` if dedicated. Then return the {ok:false} result.

**Test**: adapt existing pool-integration.test.ts to force a resolve
failure (bad runtime) and assert pool slot count returns to baseline.

### 6. `dispatch.ts:158-167` — stdoutTail byte + O(n²) bugs

**Fix**: collect chunks into an array from newest → oldest, break when
running byte total reaches maxBytes, then `Array.reverse().join("")`.
For the byte-safe truncation, do a final trim from the LEFT that
respects UTF-8 boundaries:

```ts
function stdoutTail(job, maxBytes) {
  const chunks = [];
  let bytes = 0;
  for (let i = job.output.length - 1; i >= 0; i--) {
    const chunk = job.output[i].chunk;
    const len = Buffer.byteLength(chunk, "utf8");
    bytes += len;
    chunks.push(chunk);
    if (bytes >= maxBytes) break;
  }
  const raw = chunks.reverse().join("");
  const buf = Buffer.from(raw, "utf8");
  if (buf.byteLength <= maxBytes) return raw;
  // Trim from the left to fit under maxBytes, respecting UTF-8:
  return buf.subarray(buf.byteLength - maxBytes).toString("utf8");
}
```

Node's `Buffer.subarray(...).toString("utf8")` replaces mid-codepoint
splits with U+FFFD — good enough for the tail preview.

### 7. `artifact-scan.ts:47` — porcelain parser drops renames + quoted paths

**Fix**: switch to `git status -z --porcelain --untracked-files=all`.
The `-z` output is NUL-separated with no quoting and renames are
encoded as `R<space>< space><new>NUL<old>NUL` — parse accordingly.

**Test**: extend `artifact-scan.test.ts` with:
- a rename that lands review.md into the change dir
- a change id containing a space (unlikely but the parser must not
  quote-crash)

### 8. `dispatch.ts` — promptSuffix accepted but dead

**Decision**: remove it. Wiring it through resolve() requires a design
call (append to the runtime prompt template? or replace?) that isn't
worth the surface area right now — the Manager can shape prompts via
the agent's `initialInput` if needed.

**Fix**: remove `promptSuffix` from `DispatchInput`, from the
Fastify body coercion in server/index.ts, and from the client
`dispatch()` helper.

### 9. `needs-human.ts:162` — answer truncation on inline `---`

**Fix**: track "have we seen the `answered:` footer signal yet?" and
only interpret `---` as a section-close when EITHER:

- The next non-blank line is `answered:` (peek), OR
- We are in the footer sentinel state.

Concretely, first pass scan for the LAST `---` immediately preceding an
`answered:` line, then parse body sections up to (but excluding) that
line — any earlier `---` stays part of the body.

**Test**: extend needs-human parser tests with a fixture whose Answer
section contains an inline horizontal rule.

### 10. `sidecar.ts` — writeSidecar doesn't record write for watcher

**Fix**: import `recordSidecarWrite` (or the equivalent hook from
`server/sync/watcher.ts`) and call it after `writeFile`. Use the
same pattern the existing docs / tasks writers use.

If no such hook exists, add one and expose it as `recordWrite(path)`
that computes the hash and stashes it in a Set-with-expiry that the
watcher consults before broadcasting.

### 11. `index.ts:539` — runtimeDetectionCache stale after config reload

**Fix**: subscribe to the same reload event that agents.yaml watching
uses (`agentRegistry.onReload(() => resetCache())`) and clear
`runtimeDetectionCache = null` when it fires. Next request re-detects.

### 12. `index.ts:135` — needs-human watcher path check

**Fix**: replace `filePath.endsWith("/needs-human.md")` with
`path.basename(filePath) === "needs-human.md"` (cross-platform) AND add
a check that the file's parent directory is exactly
`<projectRoot>/openspec/changes/<changeId>/` (not a subdir).

Concretely: `path.relative(openspecDir, filePath).split(path.sep)`
should equal `["changes", changeId, "needs-human.md"]` (length 3).

### 13. `ExecutionPicker.tsx:88` — crash on runtime agent

**Fix**: guard `firstAgent.command` / `firstAgent.args` with `??`
fallbacks. Show `firstAgent.runtime` when present:

```tsx
{firstAgent.command
  ? `${firstAgent.command} ${(firstAgent.args ?? []).join(" ")}`
  : `runtime: ${firstAgent.runtime ?? "unknown"}`}
```

### 14. `Kanban.tsx:460` — Archive button while job running

**Fix**: extend `showArchiveInSlot` to require `!job || job.status !== "running"`.

### 15. `changeState.ts:39` — startableCandidates ignores phase

**Fix**: add a `change.phase !== "done"` guard alongside the existing
`isDone` progress check.

## Testing budget

- Unit / integration tests: add ONLY where a fix has a clear
  observable anchor (bugs #1, #2, #4, #7, #9, #10). The rest are
  covered by existing suites once the impl is corrected.
- Manual smoke: after archive, exercise the fixed paths with
  `npm run dev` — but no user-visible feature is added, so this
  can be deferred to Phase 5.2 smoke.

## Risks

- **stdin promptStyle fix (#4)** — enables a code path the tests
  haven't exercised. Add a minimal happy-path integration test first.
- **cancel/finish restructure (#2, #3)** — changes ordering of visible
  side-effects (locks.delete now last). Any test that races cancel and
  a fresh run for the same changeId might behave differently; audit
  pool.integration.test.ts.
- **stdoutTail rewrite (#6)** — verify empty-output and
  under-maxBytes cases still return an unchanged string.
