## 1. Compatibility and Boundary Decisions

- [ ] 1.1 Record the supported GitLab Self-Managed version range and map signing-token, legacy secret-token, project-webhook, and optional group-webhook capabilities to that range
- [ ] 1.2 Decide and document the phase-3 change-generation adapter (deterministic template, model API, or isolated CLI) without adding the remote runner/PTY architecture
- [ ] 1.3 Define the versioned shared parser and hub-event envelopes, including compatibility and secret-redaction rules
- [ ] 1.4 Add a repository-boundary ADR stating why `hub/` starts in the monorepo and which measurable conditions trigger later extraction

## 2. Shared OpenSpec Core

- [ ] 2.1 Create the `shared/` workspace with normalized OpenSpec model and transport type exports
- [ ] 2.2 Move text-to-model parsing behind runtime-independent functions with no filesystem, watcher, server, GitLab, or UI imports
- [ ] 2.3 Adapt workstation filesystem readers and mutating operations to the shared parser without changing their public behavior
- [ ] 2.4 Port existing parser tests into golden compatibility fixtures covering tasks, specs, proposals, archives, paths, and parse errors
- [ ] 2.5 Add protocol compatibility tests that fail on unsupported workstation/hub event versions

## 3. Hub Runtime and Packaging

- [ ] 3.1 Create the `hub/` workspace with a headless Fastify entry point, typed configuration, health/readiness endpoints, and clean shutdown
- [ ] 3.2 Add configuration validation for GitLab origin, project allowlist, bot identity, webhook verification mode, state path, and workstation subscription credential
- [ ] 3.3 Redact secrets from hub logs, errors, configuration diagnostics, and event payloads, with regression tests
- [ ] 3.4 Add root workspace scripts plus hub typecheck, test, and build commands without changing existing workstation release behavior
- [ ] 3.5 Add a minimal multi-stage hub container build that excludes Electron, VS Code extension assets, PTY binaries, agent CLIs, and development secrets
- [ ] 3.6 Add a development compose example with hub persistent storage and documented GitLab connectivity, without bundling a production GitLab installation

## 4. Durable Event Intake

- [ ] 4.1 Define the operational persistence interface for deliveries, attempts, retry schedules, terminal errors, notification retention, and job leases
- [ ] 4.2 Implement the single-writer SQLite adapter with migrations, uniqueness constraints, lease expiry, retention cleanup, and mounted-volume diagnostics
- [ ] 4.3 Implement raw-body signing-token verification and replay-window checks for supported GitLab versions
- [ ] 4.4 Implement explicitly enabled legacy `X-Gitlab-Token` verification using constant-time comparison
- [ ] 4.5 Implement instance/project allowlisting before enqueue and redacted security audit records for rejected projects
- [ ] 4.6 Implement supported-event classification, failed-pipeline filtering, bot-loop suppression, and no-op acknowledgement for unsupported events
- [ ] 4.7 Persist the strongest available GitLab delivery identity before acknowledgement and add deterministic fallback identity tests
- [ ] 4.8 Implement bounded retry/backoff, expired-lease recovery, terminal failure reporting, and refusal of unsupported multi-replica SQLite operation
- [ ] 4.9 Add webhook contract tests for valid, invalid, duplicate, replayed, unsupported, bot-authored, and unregistered-project deliveries

## 5. Issue to Draft OpenSpec Merge Request

- [ ] 5.1 Implement an eligibility policy requiring an allowlisted Issue, `ai:spec`, and sufficient title/problem content
- [ ] 5.2 Implement canonical `<issue-iid>-<slug>` change ids, `change/<change-id>` branches, and collision-safe slug normalization
- [ ] 5.3 Fetch the default branch OpenSpec context and compute the base `openspec/specs/` revision recorded in proposal metadata
- [ ] 5.4 Implement the selected change-generation adapter and validate generated proposal, tasks, and delta specs before GitLab writes
- [ ] 5.5 Commit generated artifacts to the canonical branch through the GitLab integration using least-privilege credentials
- [ ] 5.6 Create or reconcile one Draft merge request linked to the Issue, and post one status or clarification comment without comment duplication
- [ ] 5.7 Make branch/MR creation resumable after partial failure and clear misleading lifecycle labels on terminal failure
- [ ] 5.8 Add end-to-end tests with a fake GitLab API for first creation, duplicate delivery, existing branch, existing MR, thin Issue, and partial-write recovery

## 6. Hub Event Stream and Workstation Relay

- [ ] 6.1 Implement the authenticated versioned hub WebSocket endpoint with project filtering and bounded event retention/replay
- [ ] 6.2 Add the optional workstation upstream client using hub URL/credential configuration, compatibility negotiation, bounded reconnect, and clean shutdown
- [ ] 6.3 Map hub notifications into the existing workstation WebSocket without sending hub or GitLab credentials to the browser
- [ ] 6.4 Preserve full standalone behavior when hub configuration is absent or unreachable, with regression tests for filesystem updates
- [ ] 6.5 Add separate hub-connection state to the dashboard so a hub outage does not replace the workstation live-session state
- [ ] 6.6 Validate notification targets against the configured GitLab origin/project before rendering them as clickable
- [ ] 6.7 Add integration tests from hub event publication through workstation relay to dashboard store update and reconnect recovery

## 7. GitLab CE Deployment Verification

- [ ] 7.1 Document project-webhook setup as the GitLab CE path and label group-webhook setup as Premium/Ultimate only
- [ ] 7.2 Document required GitLab outbound-network settings, HTTPS expectations, secret rotation, persistent volume backup, and least-privilege project access
- [ ] 7.3 Exercise webhook intake, retry recovery, WebSocket relay, and Issue-to-Draft-MR creation against a supported self-hosted GitLab CE test instance
- [ ] 7.4 Verify disabling the project webhook and removing workstation hub configuration restores standalone operation without data migration
- [ ] 7.5 Run root and workspace typechecks, unit/integration tests, production builds, container smoke tests, and strict OpenSpec validation

## 8. Post-Pilot Architecture Gate

- [ ] 8.1 Record pilot evidence for deployment ownership, release cadence, security access, protocol stability, and external package consumers
- [ ] 8.2 Decide whether `hub/` remains an independently released monorepo workspace or moves to a separate repository; create a separate follow-up change for extraction if its criteria are met
- [ ] 8.3 Create separate proposals for remote runners/dispatch, MR review/archive topology, and multi-user hosted operation rather than extending this foundation implicitly
