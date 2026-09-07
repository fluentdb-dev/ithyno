# ithyno-hub

`ithyno-hub` is a headless GitLab integration runtime for the GitLab foundation change. It exposes lightweight health endpoints, accepts GitLab webhooks, and broadcasts versioned events to authenticated workstation subscribers.

## Configuration

- `ITHYNO_HUB_HOST` — bind host (default `127.0.0.1`)
- `ITHYNO_HUB_PORT` — bind port (default `4322`)
- `ITHYNO_GITLAB_ORIGIN` — base GitLab origin
- `ITHYNO_GITLAB_PROJECT_ALLOWLIST` — comma-separated allowlist of `group/project`
- `ITHYNO_HUB_BOT_IDENTITY` — configured bot identity
- `ITHYNO_HUB_WEBHOOK_VERIFICATION_MODE` — `signed`, `legacy`, or `none`
- `ITHYNO_HUB_STATE_PATH` — persistent state directory
- `ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL` — workstation subscription secret

## Development

```bash
npm run --workspace @ithyno/hub build
node hub/dist/index.js
```

The sample compose file at `hub/docker-compose.yml` mounts a local data directory for persistence and documents the expected GitLab connectivity path.
