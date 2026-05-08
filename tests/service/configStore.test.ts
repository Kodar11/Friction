import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ConfigStore } from '../../src/electron/configStore.js';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-cfg-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('ConfigStore', () => {
  it('returns null when no file exists', async () => {
    const s = new ConfigStore(dir);
    expect(await s.readIfExists()).toBeNull();
  });

  it('readOrInitDefault writes a default and returns it', async () => {
    const s = new ConfigStore(dir);
    const cfg = await s.readOrInitDefault();
    expect(cfg.version).toBe(1);
    expect(cfg.siteGroups).toHaveLength(1);
    expect(cfg.scheduleBlocks[0].siteGroupIds).toEqual([cfg.siteGroups[0].id]);
    // Round-trip: re-read should equal what we got
    const again = await s.readIfExists();
    expect(again).toEqual(cfg);
  });

  it('rejects invalid config on write', async () => {
    const s = new ConfigStore(dir);
    const cfg = await s.readOrInitDefault();
    // Mutate to an invalid state (negative startMinute)
    (cfg.scheduleBlocks[0] as any).startMinute = -1;
    await expect(s.write(cfg as any)).rejects.toThrow();
  });

  it('rejects invalid config on read', async () => {
    const s = new ConfigStore(dir);
    const file = s.filePath();
    await fs.writeFile(file, JSON.stringify({ version: 1, active: false }));
    await expect(s.readIfExists()).rejects.toThrow();
  });
});
