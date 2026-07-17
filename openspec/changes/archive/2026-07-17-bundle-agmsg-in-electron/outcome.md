# Outcome — bundle-agmsg-in-electron

P3 of the agmsg integration split. Vendored fujibee/agmsg (MIT) as
a git submodule at `vendor/agmsg/` pinned to `app-v0.2.0` (commit
`f583856`), wired it into the Electron shell's `extraResources`,
and added a first-launch installer that copies the tree to
`~/.agents/skills/agmsg/` after a 3-button consent dialog.

## ✅ Worked

- **Submodule pin captures a specific release.** `git submodule add`
  landed at `app-v0.2.0` naturally (upstream default branch tip);
  `.gitmodules` gained `shallow = true` so future clones don't
  drag agmsg's full history. Bumping the pin is a one-line change
  in a follow-up.
- **`app.whenReady()` chain is the right integration point.** The
  installer runs after menu setup and before `ensureProject()` /
  `createWindowForProject()`. When the modal appears, the user
  hasn't seen a window yet, so it doesn't compete with any project
  UI for attention.
- **Three-button dialog with a persistent opt-out.** Install / Skip
  / Never ask, backed by the `~/.ithyno-config/skip-agmsg-install`
  marker. Skip is intentionally one-launch dismissal (dialog
  reappears next time) — hopefully nudges "just install it" without
  making the dialog feel harassment-y after "Never ask".
- **Windows early-return.** `platform() === 'win32'` returns before
  showing any dialog. Windows users get the current no-op behavior
  — the tmux/agmsg pipeline requires POSIX shell, so there's
  nothing to install there.
- **Executable-bit chmod pass on copy.** electron-builder's
  extraResources copy behavior for `*.sh` bits is
  documented-but-flaky across versions; the installer runs a
  recursive `chmod 0o755` on every `.sh` under the target
  `scripts/` directory after the copy to make the install
  deterministic.
- **README docs alongside the code.** Quick Start now mentions the
  submodule (`git clone --recursive`); the distribution channels
  section explains the Electron auto-install + the CLI manual-
  install path in a single paragraph.

## ⚠️ Surprises

- **`cd` persistence in the Bash tool.** After `cd vendor/agmsg`
  earlier (to inspect the submodule's git log + tag), the next
  `npm run …` invocation ran inside the vendored repo — which has
  its OWN `package.json` with a `test` script named `test`. The
  first verify chain output showed `agmsg bootstrapper 1.1.8`
  instead of ithyno's tests. Fixed by explicit `cd
  /Users/cishihara/…/openspec-ui` before the retry. Reminder for
  future submodule-inclusive changes: never assume cwd across bash
  calls when submodules are involved.
- **Auto-mode classifier blocked the initial `git submodule add`.**
  The system's safety layer treated "add external repo as
  submodule" as needing explicit user consent even though the
  proposal explicitly described it. Answer: I asked the user via
  AskUserQuestion; they authorized; then it went through. Good
  friction — the classifier defaulted safe.
- **The vendored tree includes an npm `test` script.** Not a
  correctness issue, just a small footgun for anyone running
  root-level scripts from the wrong cwd (see above).

## 🔁 Differently next time

- **Always end submodule inspection with `cd -` back to the
  project root.** Or better, use `git -C vendor/agmsg log ...`
  instead of `cd vendor/agmsg && git log`.
- **Reserve one AskUserQuestion for the "add external dep" step**
  even when the proposal is already approved. Cheaper than getting
  blocked and having to backtrack.

## 🌱 Follow-ups

- **Bump the agmsg submodule pin** when upstream ships a new
  release. Small change: `git -C vendor/agmsg fetch --tags && git
  -C vendor/agmsg checkout <new-tag>` + `git add vendor/agmsg` +
  commit. Track upstream via a periodic `check-agmsg-release` or
  just watch fujibee/agmsg on GitHub.
- **Uninstall flow.** Currently there's no "uninstall agmsg" path
  from within ithyno. Users who chose Install and later want to
  remove agmsg have to `rm -rf ~/.agents/skills/agmsg` manually.
  A menu item or a Settings tab toggle is a possible follow-up.
- **Live dialog verify.** 5.3–5.6 in tasks.md are deferred
  because full packaging + first-launch simulation needs code
  signing / Apple Developer environment on the user's side. When
  the user does a dmg build, re-run the flow and postscript this
  outcome ("verified live").
- **Windows story.** Left as no-op. If tmux-for-Windows or a WSL
  bridge becomes viable, revisit the Windows early-return and add
  a Windows-specific install path.
- **CI submodule init.** Any CI job that runs from a fresh clone
  must do `git submodule update --init --recursive` before the
  install / build steps. Not currently gated in the repo; add to
  the pipeline when CI touches Electron packaging.
