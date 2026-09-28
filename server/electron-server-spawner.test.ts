// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { buildServerSpawnEnv } from '../electron/src/server-spawner.js';

describe('buildServerSpawnEnv', () => {
  const originalLauncherToken = process.env.ITHYNO_LAUNCHER_SESSION_TOKEN;
  const originalInitPackageSpec = process.env.ITHYNO_INIT_PACKAGE_SPEC;

  beforeEach(() => {
    process.env.ITHYNO_LAUNCHER_SESSION_TOKEN = 'old-token';
  });

  afterEach(() => {
    if (originalLauncherToken === undefined) {
      delete process.env.ITHYNO_LAUNCHER_SESSION_TOKEN;
    } else {
      process.env.ITHYNO_LAUNCHER_SESSION_TOKEN = originalLauncherToken;
    }
    if (originalInitPackageSpec === undefined) {
      delete process.env.ITHYNO_INIT_PACKAGE_SPEC;
    } else {
      process.env.ITHYNO_INIT_PACKAGE_SPEC = originalInitPackageSpec;
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

  it('passes only an explicitly selected initialization package source', () => {
    process.env.ITHYNO_INIT_PACKAGE_SPEC = '/tmp/inherited-should-not-leak.tgz';
    const withoutSource = buildServerSpawnEnv({ projectRoot: '/tmp/demo' }, 4321);
    expect(withoutSource.ITHYNO_INIT_PACKAGE_SPEC).toBeUndefined();

    const withSource = buildServerSpawnEnv(
      { projectRoot: '/tmp/demo', initPackageSpec: '/tmp/ithyno-debug.tgz' },
      4321,
    );
    expect(withSource.ITHYNO_INIT_PACKAGE_SPEC).toBe('/tmp/ithyno-debug.tgz');
  });
});
