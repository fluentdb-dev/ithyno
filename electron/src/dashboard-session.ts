// SPDX-License-Identifier: GPL-3.0-or-later
export interface DashboardSessionIdentity {
  projectRoot: string;
  port: number;
  token: string;
}

export interface SpawnLike {
  child: {
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
  };
}

export type ReloadBehavior = 'reload-url' | 'recreate-server' | 'show-welcome';

function isChildHealthy(currentSpawn: SpawnLike | null): boolean {
  return currentSpawn?.child.exitCode === null && currentSpawn?.child.signalCode === null;
}

export function shouldReuseHealthySession(
  projectRoot: string | null,
  currentProjectRoot: string | null,
  currentSpawn: SpawnLike | null,
): boolean {
  if (projectRoot === null || currentProjectRoot === null || currentSpawn === null) {
    return false;
  }

  return projectRoot === currentProjectRoot && isChildHealthy(currentSpawn);
}

export function resolveReloadBehavior(
  currentSpawn: SpawnLike | null,
  currentProjectRoot: string | null,
): ReloadBehavior {
  if (isChildHealthy(currentSpawn)) {
    return 'reload-url';
  }
  if (currentProjectRoot) {
    return 'recreate-server';
  }
  return 'show-welcome';
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
