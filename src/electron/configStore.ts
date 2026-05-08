import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { CONFIG_FILENAME, defaultConfig } from '../shared/constants.js';
import { blockerConfigSchema } from '../shared/schema.js';
import type { BlockerConfig } from '../shared/types.js';

/**
 * Atomic, validated read/write of config.json — the single source of truth
 * shared between the Electron app (writer + reader) and the service
 * (reader/watcher).
 *
 * - Writes: serialise to a sibling `.tmp`, fsync, then rename. Rename is
 *   atomic on the same volume on Windows.
 * - Reads: parse + validate with Zod; on schema mismatch we surface the error
 *   to the caller rather than silently overwriting user data.
 */

export class ConfigStore {
  private readonly file: string;

  constructor(userDataDir: string) {
    fs.mkdirSync(userDataDir, { recursive: true });
    this.file = path.join(userDataDir, CONFIG_FILENAME);
  }

  filePath(): string { return this.file; }

  /** Returns null if the file doesn't exist. Throws on parse/validation errors. */
  async readIfExists(): Promise<BlockerConfig | null> {
    try {
      const raw = await fsp.readFile(this.file, 'utf8');
      const json = JSON.parse(raw);
      return blockerConfigSchema.parse(json) as BlockerConfig;
    } catch (err: any) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  /**
   * Read the config, creating a default file if missing. Use this from the
   * app's startup path so first-run is automatic.
   */
  async readOrInitDefault(): Promise<BlockerConfig> {
    const existing = await this.readIfExists();
    if (existing) return existing;
    const fresh = defaultConfig(uuid(), uuid());
    // Wire the schedule block's siteGroupIds to the freshly-minted group id.
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
}
