# Tasks

**Retrofit** — implementation landed in commit `c5beae8` (2026-07-30).
Tasks are already done; this file documents what was done for the
archive record.

## 1. Server: extend PTY env

- [x] 1.1 `server/sync/pty.ts:spawnLive` — add `ITHYNO_PORT: process.env.PORT ?? "4321"` and `ITHYNO_BASE: \`http://localhost:${process.env.PORT ?? "4321"}\`` to the child env alongside the existing `TERM` and `ITHYNO_SESSION_TOKEN`.
- [x] 1.2 Explicit `"4321"` fallback (rather than throwing) so the CLI dev workflow — which does NOT set `PORT` — stays bit-compatible.
- [x] 1.3 Comment naming the two-sided contract (Electron + VSCode spawn on ephemeral ports; skill would otherwise hit connection-refused on 4321).

## 2. Skill docs (mirrored)

- [x] 2.1 `.claude/commands/ithy-opsx/dispatch.md`: replace the `ITHYNO_BASE = http://localhost:4321` constant with the env-based resolution + explicit "do NOT hardcode 4321" note.
- [x] 2.2 `templates/.claude/commands/ithy-opsx/dispatch.md`: same edit — must stay byte-identical to `.claude/` copy per `scripts/verify-bundle.mjs` drift guard.
- [x] 2.3 `.claude/skills/ithy-opsx-dispatch-multi/SKILL.md`: same rewrite.
- [x] 2.4 `templates/.claude/skills/ithy-opsx-dispatch-multi/SKILL.md`: same rewrite (byte-identical to `.claude/` copy).
- [x] 2.5 `.claude/commands/ithy-opsx/answer.md`: replace `POST http://localhost:4321/api/changes/<id>/needs-human/answer` with `POST "${ITHYNO_BASE:-http://localhost:${ITHYNO_PORT:-4321}}/api/…"` + inline note against hardcoding 4321.
- [x] 2.6 `templates/.claude/commands/ithy-opsx/answer.md`: same rewrite (byte-identical).
- [x] 2.7 `.claude/commands/ithy-opsx/escalate.md`: same rewrite for `POST /api/changes/<id>/needs-human`.
- [x] 2.8 `templates/.claude/commands/ithy-opsx/escalate.md`: same rewrite (byte-identical).

## 3. Verification

- [x] 3.1 `diff .claude/commands/ithy-opsx/dispatch.md templates/.claude/commands/ithy-opsx/dispatch.md` — clean (drift guard passes).
- [x] 3.2 `diff .claude/skills/ithy-opsx-dispatch-multi/SKILL.md templates/.claude/skills/ithy-opsx-dispatch-multi/SKILL.md` — clean.
- [x] 3.2b `diff` on both answer.md and escalate.md pairs — clean.
- [x] 3.2c `grep -rn "http://localhost:4321" .claude/commands .claude/skills templates/.claude/commands templates/.claude/skills` returns only the intentional "Do NOT hardcode" notes; no real usage remains.
- [x] 3.3 `npm run typecheck` — clean.
- [x] 3.4 `npm test` — 645 pass / 1 skipped. `server/sync/pty.test.ts` unchanged (it mocks `node-pty` and does not exercise the actual env shape); the contract is verified manually per task 5.1.

## 4. Spec

- [x] 4.1 `openspec/changes/export-ithyno-server-vars-into-pty-env/specs/dashboard/spec.md` — ADDED requirement "Manager PTY exposes ithyno server contact vars" naming the three vars.
- [x] 4.2 `npm run openspec -- validate export-ithyno-server-vars-into-pty-env --strict` — passes.

## 5. Manual verification

- [ ] 5.1 In Electron, open a project (which will spawn on an ephemeral port). Open the Terminal panel. Run `echo "$ITHYNO_PORT $ITHYNO_BASE"` in the Manager PTY — expect the actual server port (NOT 4321) and the matching full URL. `curl "$ITHYNO_BASE/api/state"` should return 200. Then run `/ithy-opsx:dispatch <some-change-id>` and confirm the phase API calls succeed. Deferred to user — cannot exercise Electron from this environment.
- [ ] 5.2 In VSCode with the extension, same drill — the extension spawns the same `bin/ithyno.js` server on its own ephemeral port; the PTY env should reflect that port. Deferred to user.

## 6. Docs

- [x] 6.1 No CLAUDE.md changes.
- [x] 6.2 No idea capture needed — the fix and rationale are captured in this change's proposal + outcome.
