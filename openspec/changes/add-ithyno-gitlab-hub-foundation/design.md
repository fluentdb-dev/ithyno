## Context

ithyno's current server is a workstation process: it watches one checked-out project, exposes a loopback dashboard, and can launch local agent CLIs. The idea document proposes a second runtime, `ithyno-hub`, that stays online beside a self-hosted GitLab instance and connects GitLab Issues, OpenSpec changes, merge requests, and notifications.

The complete idea spans three materially different products: a GitLab integration service (phases 1-3), a remote execution platform (phases 4-5), and a multi-user hosted application (phase 6). This change establishes only the first product boundary. It must not import the workstation PTY or agent runner into a network-exposed service by accident.

GitLab CE is a hard constraint. Current GitLab documentation lists project webhooks for all tiers but group webhooks only for Premium and Ultimate. Newer GitLab versions also support signed webhooks, while older self-managed versions use the `X-Gitlab-Token` secret. The integration therefore needs capability-aware registration and verification rather than one hard-coded webhook path.

## Goals / Non-Goals

**Goals:**

- Run a headless GitLab integration continuously in Docker.
- Prove an authenticated path from a GitLab Issue label to an OpenSpec change branch and Draft merge request.
- Deliver GitLab lifecycle notifications to existing workstation dashboards.
- Preserve GitLab as the source of truth for projects, branches, merge requests, labels, and lifecycle status.
- Share parsing and protocol definitions without sharing incompatible filesystem and GitLab I/O code.
- Keep the hub independently buildable and extractable even though its first implementation lives in this monorepo.

**Non-Goals:**

- Remote runner containers, agent dispatch, AI review comments, automated archive, or worktree cleanup.
- A hosted Manager terminal or arbitrary remote shell.
- GitLab OAuth, multi-user authorization, or a hub-hosted dashboard.
- Automatic conflict resolution or Base-Spec-SHA reconciliation after merge.
- Replacing workstation ithyno or changing behavior when hub configuration is absent.

## Decisions

### D1. Begin in the monorepo, but make the hub independently deployable

Add `hub/` and `shared/` npm workspaces to this repository. `hub/` owns its entry point, package manifest, tests, configuration schema, container build, and release artifact. `shared/` exposes versioned parser inputs/outputs and transport event types. Existing workstation packages consume the same shared API.

This first slice changes the parser boundary, workstation relay, web event handling, and hub together. Keeping those changes in one repository gives atomic tests and avoids publishing a shared package before its API is stable. Independent Docker publication does not require a separate source repository.

An extraction review is required after the phase-3 contract has run against a real GitLab installation. Extraction becomes appropriate only when the hub has an independent maintainer or release cadence, or when its security boundary requires separate repository access. Before extraction, the shared API must have compatibility tests and an explicit version. If extracted, `shared/` becomes a published package or generated protocol artifact rather than copied source.

Alternatives considered:

- **Create a new repository now:** rejected because the initial work necessarily changes existing parser and dashboard code, creating cross-repository coordination and version skew before the boundary is known.
- **Keep the hub as another mode of `server/index.ts`:** rejected because the loopback workstation server and a network service have different authentication, availability, persistence, and threat models.

### D2. Deliver phases 1-3 as one bounded foundation

The implemented vertical slice is: receive webhook, durably accept it, translate an explicitly labeled Issue into a change branch, create a Draft merge request, and relay status notifications. This is enough to validate installation and operator value without executing untrusted code on the server.

Phases 4-6 require separate changes. In particular, a remote runner must not be added until isolation, credentials, cancellation, quotas, and audit requirements are specified.

### D3. Project webhooks are the CE baseline

Each registered GitLab project can configure a project webhook. An optional group-registration adapter may be enabled when the GitLab edition supports group webhooks. Startup diagnostics and documentation must not claim that a CE instance can use group webhooks.

Webhook requests are accepted only for allowlisted GitLab instances/projects. On GitLab versions that provide signing tokens, the hub verifies the signature over the raw request body and enforces a timestamp window. For compatible older installations, a legacy secret token may be explicitly enabled and compared in constant time. A failed verification is rejected before parsing or queuing.

The receiver ignores unsupported events and events authored by the configured bot identity. It returns promptly after durable acceptance; network calls, git operations, and generation happen in background jobs.

### D4. GitLab owns domain state; the hub owns minimal operational state

GitLab remains authoritative for Issue labels, branches, merge requests, assignees, and whether a change is proposed or merged. The hub does not maintain a parallel change-status database.

The hub does persist operational records that GitLab cannot provide atomically: received event identifiers, processing attempts, next retry time, terminal failure details, and active job leases. `Idempotency-Key`, `webhook-id`, or the GitLab event UUID is used as the delivery identity, with a deterministic payload fallback for older versions. A unique constraint prevents duplicate effects across webhook retries and service restarts.

The first implementation uses a persistence interface with a durable SQLite adapter suitable for a single hub container and a mounted volume. The interface and lease rules must permit a stronger database in a later multi-instance deployment. A visible GitLab label may communicate lifecycle state, but it is not treated as an atomic distributed mutex.

### D5. One Issue creates one branch and one Draft merge request

An Issue becomes eligible only when it has the configured `ai:spec` label and sufficient project permissions. The canonical change id is `<issue-iid>-<slug>`, the branch is `change/<change-id>`, and generated proposal metadata records the Issue reference and the base revision of `openspec/specs/`.

Creation is idempotent. If the canonical branch or an open merge request for it already exists, the job reconciles that resource instead of creating another. The bot commits generated OpenSpec artifacts to the branch and opens one Draft merge request. The same merge request is intended to carry later implementation, but implementation is outside this change.

Generation failure adds a clear Issue comment and a terminal job record; it must not leave an `ai:in-progress` label that appears healthy. Thin or ambiguous Issues may be rejected with a request for more information rather than generating speculative requirements.

### D6. Parsing is pure; I/O remains runtime-specific

Move normalized model types and text-to-model parsing into `shared/`. The shared parser accepts file identity plus text content and does not import filesystem, chokidar, Fastify, GitLab, or UI modules. The workstation adapter continues reading the filesystem; the hub adapter reads repository files through GitLab APIs or a checked-out branch and supplies their contents to the same parser.

Compatibility fixtures must prove that the extracted parser produces the same normalized model as the current parser. Mutable filesystem operations such as task toggling stay in the workstation server.

### D7. The workstation server is the bridge to the existing UI

When `ITHYNO_HUB_URL` and a hub credential are configured, the workstation server maintains an authenticated upstream WebSocket connection with bounded reconnect/backoff. Valid hub events are mapped to a versioned internal event envelope and then emitted through the existing dashboard WebSocket. The browser does not receive the hub credential and does not connect to the hub directly.

When hub configuration is absent, invalid, or temporarily unreachable, filesystem watching and all existing dashboard behavior continue. The UI displays hub connectivity separately from the existing workstation live indicator so a hub outage is not misreported as loss of the local session.

### D8. Hub configuration is explicit and secret-safe

Configuration identifies the GitLab base URL, allowed projects, bot identity, webhook verification mode, persistence path, workstation subscription credential, and generated branch/label conventions. Secrets come from environment variables or mounted secret files and are redacted from logs and API responses. The hub refuses production startup with default credentials or no project allowlist.

## Risks / Trade-offs

- **[GitLab version and edition differences]** → Detect supported webhook authentication/registration modes, keep project webhooks as the CE baseline, and test against declared minimum and current GitLab versions.
- **[A webhook retry creates duplicate branches or merge requests]** → Persist delivery identities before acknowledgement and make every GitLab write reconcilable by canonical branch and Issue identity.
- **[“Stateless hub” is interpreted literally]** → Document the distinction between GitLab-owned domain state and hub-owned operational delivery state; require a persistent volume.
- **[SQLite limits future horizontal scaling]** → Hide persistence behind an interface and prohibit multiple active hub replicas unless the adapter provides shared leases.
- **[Parser extraction changes workstation behavior]** → Use golden fixtures and parity tests before switching imports.
- **[Hub compromise exposes GitLab credentials]** → Use least-privilege bot credentials, project allowlists, secret redaction, network restrictions, and no runner/PTY in this phase.
- **[A monorepo becomes permanent accidental coupling]** → Enforce workspace boundaries and protocol compatibility tests; perform the extraction review after real phase-3 operation.
- **[Archive timing in the original idea is unresolved]** → Do not implement archive here. A later proposal must decide whether archive occurs before merge in the same MR or through a follow-up branch/MR.

## Migration Plan

1. Extract shared parser/types behind compatibility tests without changing workstation behavior.
2. Add the hub workspace, configuration validation, persistence, health endpoints, and container image.
3. Deploy the hub beside a non-production GitLab project using a project webhook and mounted state volume.
4. Enable authenticated event ingestion and notification relay, then opt one workstation into the upstream connection.
5. Enable the `ai:spec` Issue flow for one allowlisted project and verify idempotent Draft-MR creation and recovery.
6. Expand project registrations only after delivery, retry, and secret-rotation behavior is observed.

Rollback disables the GitLab webhook and removes `ITHYNO_HUB_URL` from workstations. Existing workstation operation remains available throughout. Hub operational data and generated GitLab branches/MRs are retained for inspection rather than deleted automatically.

## Open Questions

- What minimum GitLab Self-Managed version will ithyno-hub support, and is legacy secret-token verification required for that version?
- Which OpenSpec generation mechanism is allowed in phase 3: deterministic templates only, an existing agent CLI, or a model provider API?
- Which project-level bot permission is the minimum that can create branches, commits, Draft merge requests, labels, and Issue comments?
- What evidence will trigger extraction into a separate repository: security ownership, release cadence, deployment ownership, or package consumers outside ithyno?
- Which archive/MR topology should a later phase adopt after the original merge request has merged?
