// SPDX-License-Identifier: GPL-3.0-or-later
// Absolute-path validation shared by the "New Project" form (Settings.tsx)
// and the onboarding page (OnboardingProject.tsx). Both used to check
// `startsWith("/")`, which rejects every Windows path (`C:\...`,
// `C:/...`, UNC `\\server\share`) even though the server-side project
// root is reported in that form on win32 (see /api/health's
// `projectRoot`). That silently broke "Initialize openspec here" /
// "New Project" on Windows — the onboarding page fell straight to its
// "Missing target" error screen.
export function isAbsolutePath(path: string): boolean {
  return (
    path.startsWith("/") || // POSIX
    /^[a-zA-Z]:[\\/]/.test(path) || // Windows drive letter, either slash style
    path.startsWith("\\\\") // Windows UNC
  );
}
