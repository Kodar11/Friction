import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { CONFIG_BACKUP_V1, CONFIG_FILENAME, defaultConfig } from '../shared/constants.js';
import { blockerConfigSchema } from '../shared/schema.js';
import { migrateConfig } from '../shared/migration.js';
import type { BlockerConfig } from '../shared/types.js';

/**
 * Atomic, validated read/write of config.json — the single source of truth
 * shared between the Electron app (writer + reader) and the service
 * (reader/watcher).
 *
 * v2 migration: when we read a v1 config, we:
 *   1. Write a `config.json.v1.bak` snapshot beside it (only if no .bak exists yet)
 *   2. Run `migrateConfig` to produce a v2 shape
 *   3. Persist the v2 shape atomically
 *   4. Return the v2 config to the caller
 *
 * Writes: serialise to `.tmp`, fsync, rename — atomic on same volume on Windows.
 * Reads: validate with v2 Zod schema after migration; surface schema errors to
 * the caller rather than silently overwriting user data.
 */

export class ConfigStore {
  private readonly file: string;
  private readonly dir: string;

  constructor(userDataDir: string) {
    fs.mkdirSync(userDataDir, { recursive: true });
    this.dir = userDataDir;
    this.file = path.join(userDataDir, CONFIG_FILENAME);
  }

  filePath(): string { return this.file; }
  backupPath(): string { return path.join(this.dir, CONFIG_BACKUP_V1); }

  /** Returns null if the file doesn't exist. Throws on parse/validation errors.
   *  Migrates v1 → v2 on the fly, persisting the result and writing a `.bak`. */
  async readIfExists(): Promise<BlockerConfig | null> {
    let raw: string;
    try {
      raw = await fsp.readFile(this.file, 'utf8');
    } catch (err: any) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }

    const parsed = JSON.parse(raw);
    const { config, migrated } = migrateConfig(parsed);

    if (migrated) {
      // Snapshot the pre-migration bytes alongside the file so the user has
      // a recovery point. Only if no backup is already present (don't trash
      // an existing one with a partially-migrated config).
      const bak = this.backupPath();
      try {
        await fsp.access(bak);
      } catch {
        await fsp.writeFile(bak, raw, 'utf8');
      }
      const validated = blockerConfigSchema.parse(config) as BlockerConfig;
      await this.write(validated);
      return validated;
    }

    return blockerConfigSchema.parse(config) as BlockerConfig;
  }

  async readOrInitDefault(): Promise<BlockerConfig> {
    const existing = await this.readIfExists();
    if (existing) return existing;
    const fresh = defaultConfig(uuid(), uuid());
    fresh.scheduleBlocks[0].siteGroupIds = [fresh.siteGroups[0].id];
    await this.write(fresh);
    return fresh;
  }

  /** Validate and atomically write the given config. */
  async write(config: BlockerConfig): Promise<void> {
    const validated = blockerConfigSchema.parse(config);
    const body = JSON.stringify(validated, null, 2) + '\n';
    const tmp = this.file + '.tmp';
    const handle = await fsp.open(tmp, 'w');
    try {
      await handle.writeFile(body, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fsp.rename(tmp, this.file);
  }

  /** True if a v1 backup exists from a prior migration. */
  async hasV1Backup(): Promise<boolean> {
    try {
      await fsp.access(this.backupPath());
      return true;
    } catch {
      return false;
    }
  }
}
