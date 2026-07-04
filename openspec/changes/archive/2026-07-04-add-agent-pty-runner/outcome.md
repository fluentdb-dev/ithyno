# Outcome: add-agent-pty-runner (reverted)

## ✅ Worked

- **`node-pty` gave Claude Code / Aider / Codex a real TTY.** After
  the swap from `child_process.spawn` piped stdio to
  `@homebridge/node-pty-prebuilt-multiarch`'s `pty.spawn()`,
  Claude Code stopped idling on "no TTY, cannot start interactive
  session" and dropped straight into REPL mode. Aider's `y/N`
  prompts became answerable. Codex ran unchanged.
- **The `IPty` structural type shim** kept the runner decoupled
  from node-pty's own type surface. The `.write() / .kill() /
  .onData() / .onExit()` subset was stable across the two
  `@homebridge/node-pty-prebuilt-multiarch` versions we tested.
- **Existing worktree-per-run isolation held.** Nothing about the
  PTY switch touched `git worktree add` or the per-change lock;
  the runner's job registry stayed identical.

## ⚠️ Surprises

- **`node-pty` is a native module and doesn't ship prebuilt for
  every runtime.** The VS Code extension packaging (VSIX) needed
  a per-platform prebuild dance that vsce couldn't manage; we
  ended up excluding node-pty from the VSIX entirely and relying
  on `loadPty()`'s graceful-degradation return
  (`{ available: false, reason: ... }`). Fine for VS Code (which
  routes PTY interactions to its own terminal) but a maintenance
  burden.
- **`term.write(initialInput)` had to be split into two writes** —
  the text and the trailing `\r` as separate stdin reads —
  because Claude Code's Ink-based input handler treats a
  multi-char chunk arriving in one read as a *paste*, and `\r`
  inside a paste means "newline in the composer," not "submit."
  Discovered by staring at Claude sitting at a filled prompt with
  no Enter fired. Two-step write + 800ms pre-delay + 300ms
  inter-write delay fixed it — same automation gotcha tmux
  `send-keys` users hit.
- **Cancel via `term.kill('SIGTERM')`** was straightforward but
  Claude's REPL mode ignored SIGTERM for tens of seconds while
  finishing a token stream; needed follow-up UX work
  (`add-agent-stdin-relay`'s cancel-in-flight state) to make the
  wait tolerable.

**Reverted by [`revert-agent-pty-layers`](../archive/2026-07-04-revert-agent-pty-layers/).**
Claude Code's `-p "<initial input>"` non-interactive mode
sidesteps the whole "needs a TTY" motivation for this change.
Piped stdio + `-p` is simpler, cleaner across VS Code / Electron /
CLI, and doesn't require the two-step write, native module
gymnastics, or the interactive-cancel handling. See the reverting
change's proposal for full rationale.
