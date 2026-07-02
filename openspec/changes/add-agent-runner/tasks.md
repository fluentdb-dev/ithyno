## 1. Foundation
- [x] 1.1 Add `yaml` dependency for parsing `agents.yaml`
- [x] 1.2 Add `.worktrees/` to `.gitignore`
- [x] 1.3 Create empty `agents.yaml.example` documenting the schema and template variables

## 2. Server: agent registry
- [x] 2.1 Create `server/agents/registry.ts` that loads `agents.yaml`, validates, and caches with last-known-good fallback
- [x] 2.2 Resolve template variables (`${change_id}`, `${worktree_path}`, `${branch}`)
- [x] 2.3 Reload on file change (extend chokidar or watch the file directly)
- [x] 2.4 Add `GET /api/agents/config` (sanitize env values)

## 3. Server: worktree manager
- [x] 3.1 Create `server/agents/worktree.ts` with `create(changeId)` and `removeIfExists(changeId)` using `git worktree` commands via child_process
- [x] 3.2 Detect existing worktree before create; return a clear error
- [x] 3.3 Determine the branch name and create off current HEAD

## 4. Server: job + lock registry
- [x] 4.1 Create `server/agents/jobs.ts` with `Job` type and an in-memory registry
- [x] 4.2 Implement a `Map<changeId, jobId>` lock acquired before spawn
- [x] 4.3 Per-job ring buffer for the last 10,000 lines of output
- [x] 4.4 Cleanup on server shutdown (SIGTERM all active processes)

## 5. Server: spawner
- [x] 5.1 `child_process.spawn` with `cwd = worktree`, captured stdio
- [x] 5.2 UTF-8 decoded, line-aligned output chunks → ring buffer + WS broadcast
- [x] 5.3 Track exit code and finished status
- [x] 5.4 SIGTERM on cancel

## 6. Server: endpoints
- [x] 6.1 `POST /api/agents/run` { changeId, agentName } → 200 + job descriptor, 409 on conflict, 503 on no agents
- [x] 6.2 `GET /api/agents/jobs` and `GET /api/agents/jobs/:id`
- [x] 6.3 `POST /api/agents/jobs/:id/cancel`
- [x] 6.4 Localhost gate on all of the above (reuse `isLocal`)

## 7. Server: WS events
- [x] 7.1 Extend the existing ServerEvent type with `agent-job-started`, `agent-job-output`, `agent-job-finished`
- [x] 7.2 Broadcast on the existing `/ws`

## 8. Web: types + api + store
- [x] 8.1 Mirror server types in `web/src/types.ts`
- [x] 8.2 Add `fetchAgentConfig`, `fetchAgentJobs`, `fetchAgentJob`, `runAgent`, `cancelAgentJob` in `api.ts`
- [x] 8.3 Store: `agentConfig`, `jobs` map, `outputBuffers` map; WS handlers for the three events

## 9. Web: kanban integration
- [x] 9.1 Add Run action to TODO and IN-PROGRESS cards (single-agent direct, multi-agent picker)
- [x] 9.2 Show running status badge with agent name
- [x] 9.3 Show "ready to merge" / "failed" badge after a job ends
- [x] 9.4 Add Merge / Discard buttons that open `CommandModal` with the right `git` command, sent via `injectPty`

## 10. Web: /agents page
- [x] 10.1 New `pages/Agents.tsx` route and top-nav entry between Tags and Docs
- [x] 10.2 Active jobs on top; recent finished jobs below
- [x] 10.3 Per-job detail with live tail, Cancel / Merge / Discard actions

## 11. Skill update
- [x] 11.1 Add an "Agent runner" section to `.claude/skills/openspec-flow/SKILL.md` describing `agents.yaml` and the run-merge-discard cycle

## 12. Style
- [x] 12.1 Pulsing status indicator
- [x] 12.2 Agents page layout (job rows, tail viewer with monospace + scroll)

## 13. Verification
- [ ] 13.1 With `agents.yaml` defining a `claude` agent, clicking Run on a TODO card creates `.worktrees/<id>/` and starts the agent
- [ ] 13.2 The agents page tails the agent's output live
- [ ] 13.3 A second Run on the same change returns 409
- [x] 13.4 Two changes can run agents in parallel without interference
- [ ] 13.5 Merge button injects `git merge agent/<id>` into the embedded terminal
- [ ] 13.6 Discard button injects the worktree+branch cleanup
- [ ] 13.7 Server restart with active jobs SIGTERMs them; worktrees stay on disk for manual recovery
