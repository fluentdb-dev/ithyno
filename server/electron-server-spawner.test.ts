// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { buildServerSpawnEnv } from '../electron/src/server-spawner.js';

describe('buildServerSpawnEnv', () => {
  const originalLauncherToken = process.env.ITHYNO_LAUNCHER_SESSION_TOKEN;

  beforeEach(() => {
    process.env.ITHYNO_LAUNCHER_SESSION_TOKEN = 'old-token';
  });

  afterEach(() => {
    if (originalLauncherToken === undefined) {
      delete process.env.ITHYNO_LAUNCHER_SESSION_TOKEN;
    } else {
      process.env.ITHYNO_LAUNCHER_SESSION_TOKEN = originalLauncherToken;
    }
  });

  it('removes an inherited launcher token on a new server launch', () => {
    const env = buildServerSpawnEnv({ projectRoot: '/tmp/demo', sessionToken: undefined }, 4321);
    expect(env.ITHYNO_LAUNCHER_SESSION_TOKEN).toBeUndefined();
  });

  it('propagates the explicit port and launcher token into the child env for same-session recovery', () => {
    const env = buildServerSpawnEnv({ projectRoot: '/tmp/demo', sessionToken: 'a'.repeat(64) }, 57703);
    expect(env.PORT).toBe('57703');
    expect(env.ITHYNO_PROJECT_ROOT).toBe('/tmp/demo');
    expect(env.ITHYNO_LAUNCHER_SESSION_TOKEN).toBe('a'.repeat(64));
    expect(env.ITHYNO_OPEN).toBe('0');
  });
});
