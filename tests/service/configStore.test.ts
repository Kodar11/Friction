import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ConfigStore } from '../../src/electron/configStore.js';
import { CONFIG_BACKUP_V1, CONFIG_FILENAME } from '../../src/shared/constants.js';

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

  it('readOrInitDefault writes a v2 default and returns it', async () => {
    const s = new ConfigStore(dir);
    const cfg = await s.readOrInitDefault();
    expect(cfg.version).toBe(2);
    expect(cfg.siteGroups).toHaveLength(1);
    expect(cfg.scheduleBlocks[0].siteGroupIds).toEqual([cfg.siteGroups[0].id]);
    expect(cfg.scheduleBlocks[0].days).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(cfg.hardMode.level).toBe('light');
    const again = await s.readIfExists();
    expect(again).toEqual(cfg);
  });

  it('rejects invalid config on write', async () => {
    const s = new ConfigStore(dir);
    const cfg = await s.readOrInitDefault();
    (cfg.scheduleBlocks[0] as any).startMinute = -1;
    await expect(s.write(cfg as any)).rejects.toThrow();
  });

  it('rejects invalid config on read', async () => {
    const s = new ConfigStore(dir);
    const file = s.filePath();
    await fs.writeFile(file, JSON.stringify({ version: 2, active: false }));
    await expect(s.readIfExists()).rejects.toThrow();
  });

  it('migrates a v1 config on read, writes a .bak, and persists v2', async () => {
    const v1 = {
      version: 1,
      active: false,
      siteGroups: [{ id: 'social', name: 'Social', sites: ['youtube.com'] }],
      scheduleBlocks: [
        { id: 'b1', startMinute: 22 * 60, endMinute: 8 * 60, siteGroupIds: ['social'] },
      ],
      preferences: { autoLaunchOnBoot: false, theme: 'system', showWelcomeScreen: false },
    };
    const file = path.join(dir, CONFIG_FILENAME);
    await fs.writeFile(file, JSON.stringify(v1));

    const s = new ConfigStore(dir);
    const cfg = await s.readIfExists();
    expect(cfg).not.toBeNull();
    expect(cfg!.version).toBe(2);
    expect(cfg!.scheduleBlocks[0].days).toEqual([0, 1, 2, 3, 4, 5, 6]);

    // Backup written
    const bak = await fs.readFile(path.join(dir, CONFIG_BACKUP_V1), 'utf8');
    expect(JSON.parse(bak).version).toBe(1);

    // File on disk is now v2
    const persisted = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(persisted.version).toBe(2);
    expect(persisted.hardMode.level).toBe('light');
  });

  it('does not overwrite an existing v1 backup on subsequent reads', async () => {
    const v1 = {
      version: 1,
      active: false,
      siteGroups: [],
      scheduleBlocks: [],
      preferences: { autoLaunchOnBoot: false, theme: 'system', showWelcomeScreen: false },
    };
    const file = path.join(dir, CONFIG_FILENAME);
    await fs.writeFile(file, JSON.stringify(v1));
    const bakPath = path.join(dir, CONFIG_BACKUP_V1);
    // Pre-existing backup
    await fs.writeFile(bakPath, '{"sentinel":true}');

    const s = new ConfigStore(dir);
    await s.readIfExists();

    const bakStill = await fs.readFile(bakPath, 'utf8');
    expect(JSON.parse(bakStill)).toEqual({ sentinel: true });
  });
});
