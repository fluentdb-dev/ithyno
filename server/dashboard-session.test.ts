// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  buildSessionRecoveryOptions,
  resolveReloadBehavior,
  shouldReuseHealthySession,
} from '../electron/src/dashboard-session.js';

describe('shouldReuseHealthySession', () => {
  it('reuses the active child for a healthy same-project reload', () => {
    expect(shouldReuseHealthySession('/project-a', '/project-a', { child: { exitCode: null } })).toBe(true);
  });

  it('does not reuse the active child after a project switch', () => {
    expect(shouldReuseHealthySession('/project-b', '/project-a', { child: { exitCode: null } })).toBe(false);
  });
});

describe('resolveReloadBehavior', () => {
  it('keeps the existing server alive for a healthy active session', () => {
    expect(resolveReloadBehavior({ child: { exitCode: null } }, '/project-a')).toBe('reload-url');
  });

  it('recreates the server when a project is active but the child is no longer healthy', () => {
    expect(resolveReloadBehavior({ child: { exitCode: 1 } }, '/project-a')).toBe('recreate-server');
  });

  it('shows the welcome screen when no project session is active', () => {
    expect(resolveReloadBehavior(null, null)).toBe('show-welcome');
  });
});

describe('buildSessionRecoveryOptions', () => {
  it('reuses the current dashboard identity for the current project', () => {
    const options = buildSessionRecoveryOptions('/project-a', {
      projectRoot: '/project-a',
      port: 57703,
      token: 'a'.repeat(64),
    });
    expect(options).toEqual({ port: 57703, sessionToken: 'a'.repeat(64) });
  });

  it('does not reuse a prior identity after a project switch', () => {
    const options = buildSessionRecoveryOptions('/project-b', {
      projectRoot: '/project-a',
      port: 57703,
      token: 'a'.repeat(64),
    });
    expect(options).toEqual({});
  });
});
