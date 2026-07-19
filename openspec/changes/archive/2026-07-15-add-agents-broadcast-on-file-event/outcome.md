# Outcome — add-agents-broadcast-on-file-event

Added `agents-updated` WebSocket broadcast so external `agents.yaml`
edits propagate to the Agents tab live. Landed on `phase-workflow`
across 4 commits (propose+impl + 3 follow-up fixes discovered during
verify).

## ✅ Worked

- **`agents-updated` broadcast on file change**: server emits fresh
  `publicConfig()` payload; client applies to `agents` +
  `agentConfigError` state without a separate GET.
- **Debounce 100 ms**: collapses `.tmp → rename` atomic-write bursts
  into a single broadcast (chokidar `awaitWriteFinish` + our own
  `setTimeout`).
- **End-to-end verify via puppeteer**: renamed `pptr` → `pptr-live`
  in agents.yaml, observed DOM update within ~1s without any reload
  or Modal interaction.

## ⚠️ Surprises

- **Three follow-up fixes were required to make end-to-end work,
  none obvious from the initial spec:**

  1. **`fs.watch(file)` loses the watch after atomic rename on macOS**
     (bb0d08d). The initial impl used `node:fs/promises.watch` on the
     file path. Editors that write atomically (`.tmp → rename`) fired
     ONE event and then the watcher went silent. Switched to chokidar
     (already a dependency for `server/sync/watcher.ts`) which
     re-establishes on unlink.

  2. **`ws.onmessage`'s top-level `if (!cur) return` was dropping
     ALL messages when workspace state was null** (29a914c). Guard
     was intended for `change-updated` / `spec-updated` which mutate
     `state`; it also short-circuited `agents-updated` and other
     independent event types. Moved the gate inline into the two
     handlers that actually depend on `state`.

  3. **Manager section reads from a separate `managerStatus` store
     field** (7d362b2). The `agents-updated` handler only refreshed
     `agents`; the Manager section (fed by `/api/manager/status`)
     stayed stale — user saw the old manager name as a ghost row.
     Handler now fires `loadManagerStatus()` too.

- The bug was misdiagnosed twice during debugging:
  - First hypothesis: "ブラウザキャッシュ" — user reported hard
    reload and different browser didn't help, ruling it out.
  - Second hypothesis: "React key=name reconciliation" — user's
    intuition pointed at key, but the actual cause was the WS gate.

- **Puppeteer verify was essential** — it isolated the diagnostic
  from the user's browser cache. Curl confirmed server side; DOM
  inspection isolated client side.

## 🔁 Differently

- **Should have grepped `if (!cur) return` in the WS handler as
  the first step of debugging**, not after multiple rounds. The gate
  is subtle because it's at the top of the switch and easy to miss
  when scanning the file for the specific event handler.

- **Should have tested with puppeteer earlier**. Once I did, the
  gap between server state and DOM was visible in one shot.

- **Should have known Manager section reads from a separate
  endpoint**. That's documented in `add-agents-tab-manager-section`
  but I forgot to check when writing `agents-updated`. Adding
  Manager section to the "what could go stale" checklist next time.

## 🌱 Follow-ups

- **Integration test** for the broadcast pipeline — tasks 4.1/4.2
  were deferred. If broadcast semantics change, we lose the safety
  net. Chokidar + WS make it non-trivial but not impossible; could
  use a real HTTP + WS test harness.

- **Consider a shared "invalidate agents context" event** on server
  side that both `agents-updated` and `manager-status-updated`
  derive from. Right now the client's `agents-updated` handler has
  to remember to call `loadManagerStatus`; adding a new
  `agents.yaml`-derived state field later would require updating
  this handler again.

- **Debounce measurement** (6.4): the current setup is a plain
  `setTimeout(..., 100)` chained after chokidar's `awaitWriteFinish`
  (50 ms). Worth logging + measuring in a real editor session to
  confirm it doesn't over- or under-fire.

- **`agents-updated` payload could be smaller**. Currently sends
  the full agents array on every fire; for a large yaml this adds
  up. If we hit a scale problem, switch to per-agent diff events
  (`agent-added` / `agent-removed` / `agent-updated`). Not needed
  at current scale (<20 agents typical).
