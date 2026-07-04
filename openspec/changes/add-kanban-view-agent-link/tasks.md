## 1. Kanban: AgentBadge → Link

- [ ] 1.1 In `web/src/components/Kanban.tsx::AgentBadge`, wrap the badge content in `<Link to={`/agents?job=${jobId}&tab=output`} onClick={e => e.stopPropagation()}>` when `job` is defined
- [ ] 1.2 Preserve existing pulse animation for `job.status === "running"`
- [ ] 1.3 No badge (unchanged) when `job` is undefined — nothing to link to

## 2. Kanban: hover cue

- [ ] 2.1 In `web/src/styles.css`, add `.agent-badge:hover { text-decoration: underline; opacity: 0.85; }` or an inline chevron `→` shown on hover
- [ ] 2.2 Ensure the badge still reads as visually distinct from ordinary text (existing pill styling preserved)

## 3. ChangeDetail: header agent link

- [ ] 3.1 In `web/src/pages/ChangeDetail.tsx`, resolve the latest job for the change (same `Object.values(jobs).filter(...).sort(...)` pattern already used elsewhere in the file)
- [ ] 3.2 Render a `<Link to={`/agents?job=${latestJob.id}&tab=output`}>● {latestJob.agentName} · view agent</Link>` near the existing progress bar / worktree pill area
- [ ] 3.3 Gate on `!!latestJob` — no link when no agent has ever run for this change
- [ ] 3.4 Style: match the existing `.detail-worktree-badge` / `.detail-tree-pill` styling so all three "action pills" read as a related family

## 4. Regression checks

- [ ] 4.1 Kanban card's primary click behavior (navigate to `/change/<id>`) is unchanged — stopPropagation on the badge link prevents accidental double-navigation
- [ ] 4.2 CommandModal / Start / Merge / Discard flows unchanged

## 5. Spec delta

- [ ] 5.1 `openspec/changes/add-kanban-view-agent-link/specs/dashboard/spec.md`: MODIFIED requirement covering the Kanban badge and ChangeDetail header both linking to the Agents page

## 6. Verification

- [ ] 6.1 Start an agent under Worktree mode from Kanban; the card's `● claude` badge is now clickable and navigates to `/agents?job=<id>&tab=output` with the transcript already scrolled into view
- [ ] 6.2 Hover over the badge → visual cue (underline or chevron) confirms the affordance
- [ ] 6.3 Click on the CARD (not the badge) → still navigates to `/change/<id>` — badge click doesn't hijack the card click
- [ ] 6.4 Navigate to ChangeDetail for the same change → header shows `● claude · view agent` link → click → same `/agents?job=<id>` destination
- [ ] 6.5 On a change with no agent history: no badge on the Kanban card, no "view agent" link on ChangeDetail — nothing to link to, so nothing is rendered
- [ ] 6.6 Regression: existing Kanban Start / Merge / Discard / Archive buttons still work; no accidental click routing to the Agents page from those
