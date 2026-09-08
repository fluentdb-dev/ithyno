## Why

ithyno currently coordinates OpenSpec changes only while a workstation instance is running, so a self-hosted GitLab project cannot turn an Issue into a reviewable OpenSpec change or relay lifecycle notifications without workstation-specific setup. A separately deployable, headless integration foundation is needed before remote runners or a multi-user hosted dashboard can be considered safely.

## What Changes

- Add an independently deployable `ithyno-hub` service that receives authenticated GitLab webhooks, filters supported events, and treats GitLab projects, branches, merge requests, and labels as the authoritative domain state.
- Support GitLab CE through per-project webhooks, with group webhooks available only as an optional Premium/Ultimate registration mode.
- Add durable operational bookkeeping for webhook deduplication, retries, and job leases without creating a second source of truth for change or merge-request state.
- Add an Issue-to-OpenSpec flow that reacts to an explicit `ai:spec` label, creates a `change/<issue-number>-<slug>` branch, records the base spec revision, and opens one Draft merge request for human review.
- Extract reusable OpenSpec parsing and transport types into an internal shared package while keeping filesystem and GitLab I/O implementations separate.
- Relay hub events over an authenticated WebSocket connection to the existing workstation server and dashboard, while preserving the current standalone behavior when no hub is configured.
- Ship the hub from this monorepo as its own workspace and container image. Define a versioned boundary so it can be extracted into a separate repository later without coupling the first implementation to cross-repository releases.
- Exclude remote agent runners, server-hosted Manager terminals, automated implementation/review/archive, GitLab OAuth, and multi-user hosted operation from this foundation change.

## Capabilities

### New Capabilities

- `gitlab-hub`: Authenticated, CE-compatible GitLab event ingestion and Issue-to-Draft-MR OpenSpec orchestration.
- `hub-event-delivery`: Durable event processing, deduplication, retry handling, job leases, and authenticated downstream event delivery.

### Modified Capabilities

- `openspec-parsing`: Make the normalized OpenSpec parser usable from supplied text/content independently of workstation filesystem I/O.
- `dashboard`: Allow the workstation server to relay authenticated hub notifications through the existing dashboard live-update channel without changing standalone operation.
- `build-system`: Add separately buildable and containerizable hub/shared workspaces to the monorepo.

## Impact

- Adds `hub/` and `shared/` workspaces, a hub container build, GitLab API integration, webhook verification, and an operational persistence adapter.
- Changes parser module boundaries under `server/parser/` while preserving current parser output and workstation behavior.
- Adds optional workstation configuration for a hub URL and credential, plus an upstream WebSocket client in the server process.
- Requires GitLab project webhook setup on CE. Group-wide setup remains optional because GitLab documents group webhooks as a Premium/Ultimate feature.
- Introduces a network-exposed service with stricter authentication, secret handling, project allowlisting, auditability, and retry requirements than the existing loopback-only server.
