# Outcome — auto-sync-agmsg-spawn-options

Server-side companion to `thread-model-arg-through-agmsg-spawn`.
Landed a small module (`server/agents/spawn-options-writer.ts`)
that mirrors non-`--model` CLI flags from live-shell workers in
`agents.yaml` into `~/.agmsg/config/spawn_options.yaml` on server
boot and on UI Save. Users never touch the agmsg config file
directly — the whole surface is managed through the Agents tab.

## ✅ Worked

- **Live verify happened in the running dev server.** After
  writing the code + integration points, the running `tsx watch`
  dev server auto-reloaded, executed the boot-time sync, and
  materialized `~/.agmsg/config/spawn_options.yaml`. The file
  contents matched the expected output exactly:

  ```yaml
  claude-code:
    --dangerously-skip-permissions: true
  copilot:
    --yolo: true
  ```

  Confirming: `--model` skipped correctly (dispatcher owns it),
  `pptr` manager excluded correctly, `-s` short-flag correctly
  detected as a flag boundary (not swallowed as `--yolo`'s value).
- **Hand-rolled YAML parser + emitter** for agmsg's flat dialect
  (`<type>:` + 2-space `<flag>: <value>`). Chose this over the
  `yaml` package to guarantee byte-identical round-trip with
  agmsg's own awk-based `spawn-options.sh` reader — the two must
  stay in perfect agreement.
- **Idempotent + defensive.** Sync failures on Save don't fail
  the UI Save (agents.yaml write succeeds first, sync is
  best-effort). Corrupt existing spawn_options.yaml bails silently
  rather than clobber. Directory auto-created via `mkdir -p`.
- **10 unit tests + 1 round-trip test** cover the boundary
  conditions: `--model` skip, manager exclusion, unknown-command
  skip, stale-entry removal, unmanaged-type preservation, empty-
  section removal, atomic-write `.tmp` cleanup.

## ⚠️ Surprises

- **Short-flag boundary logic.** My first parser check was
  `next.startsWith("--")` — any `--`-prefixed next token treated
  the current flag as boolean, but a bare `-` prefix (`-s`,
  `-m opus`) was treated as a value. The first test with copilot's
  `--yolo -s` immediately surfaced this: `--yolo` was emitted as
  `--yolo: "-s"` (wrong; `-s` is a separate flag). Fixed by
  checking any `-` prefix as boundary. Convention: value tokens
  must not start with `-`; if they do, use `--flag=value` syntax.
- **cfg cast at integration points.** `registry.publicConfig()`
  returns a public-shape config (env redacted) that's a structural
  superset of `AgentConfig` for what `syncSpawnOptions` reads —
  had to `as unknown as AgentConfig` at both call sites. Not
  ideal; the module could accept a wider type or the registry
  could expose an internal-shape getter. Left as-is because both
  integration points are small and the cast is documented.

## 🔁 Differently next time

- **Write the round-trip parse/stringify test FIRST.** Nailing
  the file format contract with a single test case (parse ->
  stringify -> compare bytes) forces the parser and emitter to
  agree from the start. Doing that here would have caught the
  boolean-emission conventions immediately.
- **Live server verify is free when tsx-watch is running.**
  Landing the code and getting the live file appear was one
  keystroke. If not for that, I would have run the boot manually
  to check.

## 🌱 Follow-ups

- **Per-project spawn options via `AGMSG_SPAWN_OPTIONS_FILE`**.
  The single global `~/.agmsg/config/spawn_options.yaml` means two
  ithyno projects on the same machine that declare conflicting
  args for the same agmsg-type will last-write-win. Setting
  `AGMSG_SPAWN_OPTIONS_FILE=$PROJECT/.ithyno/spawn_options.yaml`
  in the dispatcher's environment would give per-project scoping.
  Small change but requires the dispatcher skill to set the env
  var before `/agmsg spawn`, or the server to also write per-
  project file. Deferred until conflict is actually observed.
- **chokidar-driven re-sync.** Currently the sync runs at boot
  and on UI Save. External hand-edits to `agents.yaml` (outside
  the Save path) don't trigger a re-sync. The registry already
  chokidar-watches `agents.yaml`; teaching the watcher to also
  fire the sync would close that gap.
- **Warning surface for sync failures.** Currently only
  `console.warn`. When the corrupt-file bail-out fires the user
  has no idea. Adding a `warnings` field to `agents-updated` WS
  event would surface it in the UI.
- **Type-safety of cfg cast.** Widen `syncSpawnOptions`' input
  type to the structural minimum it reads (or add an explicit
  internal-shape accessor on registry) so the two integration
  points don't need `as unknown as`.
