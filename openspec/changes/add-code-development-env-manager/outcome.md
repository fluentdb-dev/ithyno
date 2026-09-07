## ✅ Worked
- Added a shared server-side development environment resolver for `.env*` profile discovery, precedence handling, masking, and selection persistence.
- Wired the selected profile into new Manager PTYs and AgentRunner jobs so spawned processes receive the project environment.
- Added an Environment page in the dashboard and exposed local API endpoints for selection, diagnostics, reveal, and mutation.

## ⚠️ Surprises
- Fastify route overloads for array-based path registration were less compatible with the current typings than expected, so the environment endpoints were registered as individual routes.
- The resolver needed explicit reserved-key filtering so `ITHYNO_*` values remained authoritative and could not be overridden by project env files.

## 🔁 Differently
- The UI is intentionally lightweight and focuses on selection, masked inspection, and explicit reveal rather than full editor workflows.
- Plaintext values remain server-side only; the API and UI expose masked metadata by default.

## 🌱 Follow-ups
- Expand the UI to support richer edit/delete workflows and more detailed diagnostics.
- Add broader end-to-end coverage around reveal/mutation flows and packaged runtime behavior.
