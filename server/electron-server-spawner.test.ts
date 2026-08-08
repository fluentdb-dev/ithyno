// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { buildServerSpawnEnv } from '../electron/src/server-spawner.js';

describe('buildServerSpawnEnv', () => {
  it('propagates the explicit port and launcher token into the child env', () => {
    const env = buildServerSpawnEnv({ projectRoot: '/tmp/demo', sessionToken: 'a'.repeat(64) }, 57703);
    expect(env.PORT).toBe('57703');
    expect(env.ITHYNO_PROJECT_ROOT).toBe('/tmp/demo');
    expect(env.ITHYNO_LAUNCHER_SESSION_TOKEN).toBe('a'.repeat(64));
    expect(env.ITHYNO_OPEN).toBe('0');
  });

  it('omits the launcher token when none was supplied', () => {
    const env = buildServerSpawnEnv({ projectRoot: '/tmp/demo', sessionToken: undefined }, 4321);
    expect(env.PORT).toBe('4321');
    expect(env.ITHYNO_LAUNCHER_SESSION_TOKEN).toBeUndefined();
  });
});
