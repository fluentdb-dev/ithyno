# Outcome: add-agents-tab-live-panel

## ✅ Worked

- **4-section fleet view landed.** Runtimes / Live / Configured (idle) /
  Recent jobs — the tab now reads top-down as "what CLIs are installed" →
  "who's running" → "who could run" → "what did we recently ship". This
  matches the user's earlier direction: "AgentsはどのAgentの設定と
  Agentsが動いているかだけ分かればいい / 何を何をしているのかの踏み
  込むのは看板とかぶる".
- **Client mirror stayed thin.** `RuntimeDefPublic` /
  `RuntimeStatusResponse` mirror the server's shape (`server/agents/
  registry.ts`) with no logic — just types. `fetchAgentRuntimes(refresh)`
  is a one-liner over `/api/agents/runtimes[?refresh=1]`.
- **Verdict badges pulled from Phase 3.5.** No new server work — the
  badge reads `job.verdict` set by `add-review-artifact`. Recent jobs
  produced by `/opsx:review` now surface pass / needs-rework(N) inline.
- **`AgentPublic` shape absorbed cleanly.** command/args were made
  optional (runtime-backed agents omit them) and runtime/prompt/role/
  specialties/concurrency/dedicated were added. No existing consumer
  broke because Kanban's Run button only ever checked `agents.length`.

## ⚠️ Surprises

- **`Object.values` selector triggered a React 19 render loop early on.**
  Wrapped with `useMemo(() => Object.values(jobsMap), [jobsMap])` — the
  jobs map itself is stable across renders, only its values would create
  a new array each call. This is the same trap that hit
  `add-needs-human-phase`; worth remembering.
- **YAML flow-list quoting bit us again on registry-runtime.test.ts.**
  `[--flag, /opsx:apply ${id}]` looks fine but the YAML parser rejects
  it — `-` inside a flow scalar is ambiguous. Quoting each element
  fixed it. Pattern is now consistent across the codebase.
- **`git status --porcelain` collapses new dirs.** Discovered while
  building the review-artifact scanner: adding `--untracked-files=all`
  is the only way to see individual files inside a new worktree
  directory. Fix landed here as a side-effect but originated in Phase
  3.2 dispatch endpoint's file-detection code.

## 🔁 Differently

- **Skip the manual smoke phase — defer it.** Tasks 7.1–7.3 stayed
  unchecked; the user chose option (d) "UI 確認は諦めて Phase 5.1 に進む".
  With Manager loop dispatch not yet wired to a live browser session,
  interactive verification would burn a session for signal we can't
  currently observe. Post-phase-workflow merge + a fresh dev server is
  the right moment.
- **AgentRow / RuntimeRow / JobVerdictBadge as inline sub-components.**
  Considered pulling them into `web/src/components/`, but they're used
  once each in one page — extracting would just add import noise. If a
  second consumer appears (config UI in Phase 5.2), promote then.

## 🌱 Follow-ups

- **Phase 5.2 (`add-agents-config-ui`).** The Configured (idle) section
  currently reads agents as flat rows. 5.2 adds edit UX (name, role,
  runtime picker, concurrency slider) via a modal opened from each row.
- **Phase 5.3 (`add-agents-config-write`).** POST /api/agents/config
  with atomic write + validation error surfacing.
- **Runtime install hints.** When a runtime shows "not found", we
  currently print the error string from the detector. A follow-up could
  link to an install doc (`docs/runtimes/<name>.md`) — deferred until we
  have more than 2 runtimes declared.
- **Verdict badge summary tooltip.** Uses `title=` for the review
  summary — fine for now, but a hover popover with the top 3 findings
  would be more usable once Manager routinely produces reviews.
