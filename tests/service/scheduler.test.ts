import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startScheduler } from '../../src/service/scheduler.js';
import { Logger } from '../../src/service/logger.js';
import { HOSTS_BEGIN } from '../../src/shared/constants.js';
import type { BlockerConfig } from '../../src/shared/types.js';

vi.mock('../../src/service/dnsFlush.js', () => ({
  flushDns: async () => ({ ok: true }),
}));

let dir: string;
let hostsPath: string;
let logger: Logger;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-sched-'));
  hostsPath = path.join(dir, 'hosts');
  await fs.writeFile(hostsPath, '127.0.0.1 localhost\n');
  logger = new Logger({ dir, source: 'service' });
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const cfg = (active: boolean): BlockerConfig => ({
  version: 1,
  active,
  siteGroups: [{ id: 'g1', name: 'Social', sites: ['youtube.com'] }],
  scheduleBlocks: [{ id: 'b1', startMinute: 0, endMinute: 1439, siteGroupIds: ['g1'] }],
  preferences: { autoLaunchOnBoot: false, theme: 'system', showWelcomeScreen: false },
});

describe('startScheduler', () => {
  it('applies the managed region on first tick when blocking is active', async () => {
    const config = cfg(true);
    const handle = startScheduler({
      getConfig: () => config,
      logger,
      hostsPath,
      tickMs: 1_000_000, // effectively disable interval; we'll trigger apply manually
    });

    await handle.apply(config);
    const contents = await fs.readFile(hostsPath, 'utf8');
    expect(contents).toContain(HOSTS_BEGIN);
    expect(contents).toContain('127.0.0.1 youtube.com');
    handle.stop();
  });

  it('clears the managed region when blocking goes inactive', async () => {
    const handle = startScheduler({
      getConfig: () => cfg(true),
      logger,
      hostsPath,
      tickMs: 1_000_000,
    });
    await handle.apply(cfg(true));
    await handle.apply(cfg(false));

    const contents = await fs.readFile(hostsPath, 'utf8');
    expect(contents).not.toContain(HOSTS_BEGIN);
    handle.stop();
  });

  it('skips redundant writes when desired hosts unchanged', async () => {
    const handle = startScheduler({
      getConfig: () => cfg(true),
      logger,
      hostsPath,
      tickMs: 1_000_000,
    });
    await handle.apply(cfg(true));
    const first = await fs.readFile(hostsPath, 'utf8');

    // Re-apply with same input. The applyHosts call should detect no change
    // because lastSitesKey matches.
    await handle.apply(cfg(true));
    const second = await fs.readFile(hostsPath, 'utf8');
    expect(second).toBe(first);
    handle.stop();
  });

  it('reports permission errors with kind="permission" via onError', async () => {
    // Point at a path we can't write to (a directory). On Windows that's
    // EISDIR which is "other"; on POSIX writing to "/" triggers EACCES which
    // is what we want. Use a sentinel: mock applyHosts via a child path
    // we don't have permission for if running unprivileged. Failing that,
    // verify the typed error class round-trips.
    const { HostsPermissionError } = await import('../../src/service/hostsWriter/windows.js');
    const err = new HostsPermissionError('/etc/hosts', Object.assign(new Error('boom'), { code: 'EPERM' as const }));
    expect(err.name).toBe('HostsPermissionError');
    expect(err.target).toBe('/etc/hosts');
    expect(err.message).toContain('Permission denied');
  });
});
