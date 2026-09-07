# ADR 0001: Start ithyno-hub in the monorepo as an independently deployable workspace

- Status: Accepted
- Date: 2026-09-07

## Context

The initial foundation needs to change parser boundaries, workstation relay code, and GitLab integration behavior together. A separate repository would create version skew before the protocol and deployment rules are stable.

## Decision

Create `hub/` and `shared/` npm workspaces inside the monorepo. The hub owns its own Fastify entry point, configuration contract, tests, and container build. The shared package exposes parser and event-envelope types that can be consumed by both workstation and hub implementations.

## Consequences

- The monorepo can validate the parser boundary and workstation relay together.
- The hub can later be extracted once release cadence, ownership, and protocol compatibility are proven.
- The initial implementation remains easier to deploy because the workspace boundary is explicit, even though the code still ships from the same repository.
