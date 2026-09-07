# GitLab hub foundation notes

## Supported GitLab compatibility

The initial hub foundation targets GitLab Self-Managed 16.x and later. The runtime prefers raw-body signature verification for signed webhook deliveries and uses an explicitly enabled legacy `X-Gitlab-Token` path only when an operator opts into token-based verification for older deployments.

- Signed-token verification: preferred for GitLab versions that expose a raw-body signature header.
- Legacy token verification: opt-in fallback for older self-managed instances that still rely on `X-Gitlab-Token`.
- Project webhooks: baseline registration path for GitLab CE and supported self-managed versions.
- Group webhooks: optional path only when the configured GitLab edition reports support.

## Phase-3 change generation adapter

The initial change-generation path uses a deterministic template and validation pipeline in the hub workspace. It does not add the remote execution, PTY, or full agent runner architecture from later phases.

## Repository boundary

The hub and shared workspaces start in the monorepo so the parser boundary, event protocol, and workstation relay can be validated together. Extraction becomes a follow-up decision once deployment ownership, release cadence, and protocol stability have been proven in the field.
