// SPDX-License-Identifier: GPL-3.0-or-later
export interface DashboardSessionIdentity {
  projectRoot: string;
  port: number;
  token: string;
}

export interface SpawnLike {
  child: {
    exitCode: number | null;
  };
}

export function shouldReuseHealthySession(
  projectRoot: string | null,
  currentProjectRoot: string | null,
  currentSpawn: SpawnLike | null,
): boolean {
  if (projectRoot === null || currentProjectRoot === null || currentSpawn === null) {
    return false;
  }

  return projectRoot === currentProjectRoot && currentSpawn.child.exitCode === null;
}

export function buildSessionRecoveryOptions(
  projectRoot: string | null,
  currentDashboardSession: DashboardSessionIdentity | null,
): { port?: number; sessionToken?: string } {
  if (projectRoot === null) return {};
  if (currentDashboardSession?.projectRoot === projectRoot) {
    return {
      port: currentDashboardSession.port,
      sessionToken: currentDashboardSession.token,
    };
  }
  return {};
}
