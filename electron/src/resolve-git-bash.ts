// SPDX-License-Identifier: GPL-3.0-or-later
// Locate Git for Windows' real bash.exe — never a bare PATH search for
// "bash". Windows ships two bash.exe stubs that are NOT Git Bash:
// C:\Windows\System32\bash.exe and the WindowsApps execution-alias
// bash.exe. Both are WSL launchers — running them starts WSL (if
// installed) or prompts to install it from the Store. A PATH search for
// a bare `bash` command can resolve to either of those ahead of Git's
// own bash.exe depending on PATH ordering, silently doing the wrong
// thing. Deriving the path from `git`'s own self-reported install
// layout avoids that ambiguity entirely.
//
// Landed by add-windows-agmsg-support.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Resolve Git for Windows' `bash.exe`, or `null` if git isn't on PATH
 * or the derived bash.exe doesn't exist. Only meaningful on win32 —
 * callers should gate on `process.platform === 'win32'` themselves;
 * this function doesn't check platform itself since it's cheap and
 * harmless to call anywhere (macOS/Linux just won't have "git" resolve
 * usefully into a Windows-shaped layout, but that's not this
 * function's concern).
 */
export function resolveGitBash(): string | null {
  let execPath: string;
  try {
    const result = spawnSync('git', ['--exec-path'], { encoding: 'utf8' });
    if (result.status !== 0 || !result.stdout) return null;
    execPath = result.stdout.trim();
  } catch {
    return null;
  }
  if (!execPath) return null;

  // execPath looks like "<gitRoot>/mingw64/libexec/git-core" — walk up
  // three levels to the Git for Windows installation root.
  const gitRoot = resolve(dirname(dirname(dirname(execPath))));
  const bashExe = join(gitRoot, 'bin', 'bash.exe');
  return existsSync(bashExe) ? bashExe : null;
}
