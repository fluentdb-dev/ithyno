## ✅ Worked
- Added a shared server-side development environment resolver for `.env*` profile discovery, precedence handling, masking, and selection persistence.
- Wired the selected profile into new Manager PTYs and AgentRunner jobs so spawned processes receive the project environment.
- Added an Environment page in the dashboard and exposed local API endpoints for selection, diagnostics, reveal, and mutation.

## ⚠️ Surprises
- Fastify route overloads for array-based path registration were less compatible with the current typings than expected, so the environment endpoints were registered as individual routes.
- The resolver needed explicit reserved-key filtering so `ITHYNO_*` values remained authoritative and could not be overridden by project env files.

## 🔁 Differently
- The UI uses staged edit/delete workflows with an explicit save review so profile changes are visible before disk mutation.
- Plaintext values remain server-side only; the API and UI expose masked metadata by default.

## 🌱 Follow-ups
- Add OS credential-store integrations so dotenvx keys do not need to live in the general application environment.
- Add broader end-to-end coverage around reveal/mutation flows and packaged runtime behavior.
