## Context

The watcher uses chokidar with awaitWriteFinish so it only re-parses once a
write settles — correct for data integrity, but it hides in-flight streaming
writes from the user. Architecture §6.5 anticipated this and reserved a
lightweight signal for it.

## Goals / Non-Goals

**Goals:**
- Tell clients which change is being written, as soon as writing starts.
- Clear the signal when the settled content is broadcast.
- Never parse half-written content for the signal.

**Non-Goals:**
- Showing a live diff or partial content while writing.
- Changing the settled re-parse/broadcast behavior.

## Decisions

- Add a second chokidar watcher (or the raw `all` event) without awaitWriteFinish
  to catch the leading edge, debounced, emitting `file-writing` with the change id.
- The settled `change-updated` event implicitly clears the badge; also clear on a
  short timeout as a safety net if a write is abandoned.
- Keep echo suppression: the server's own writes must not raise a writing signal.

## Risks / Trade-offs

- Two watch passes add overhead; mitigated by emitting only the change id and
  debouncing, with no parsing on the leading edge.
- A crashed/abandoned write could leave a stale badge; the timeout clears it.
