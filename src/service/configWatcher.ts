import chokidar, { type FSWatcher } from 'chokidar';
import fsp from 'node:fs/promises';
import { blockerConfigSchema } from '../shared/schema.js';
import { migrateConfig } from '../shared/migration.js';
import type { BlockerConfig } from '../shared/types.js';

/**
 * Watch config.json for changes. We use chokidar because Node's native
 * fs.watch is unreliable on Windows for atomic-rename writes (which is exactly
 * how the app writes config). chokidar's `awaitWriteFinish` smooths out
 * tmp→rename sequences.
 *
 * The watcher debounces to a single onChange callback per actual content
 * change. The scheduler also re-reads on its tick, so a missed event still
 * gets caught within 60s.
 */

export interface ConfigWatcher {
  current(): BlockerConfig | null;
  refresh(): Promise<BlockerConfig | null>;
  close(): Promise<void>;
}

export interface WatcherOpts {
  path: string;
  onChange: (cfg: BlockerConfig) => void;
  onError?: (err: unknown) => void;
}

export async function startConfigWatcher(opts: WatcherOpts): Promise<ConfigWatcher> {
  let cached: BlockerConfig | null = null;
  let lastRaw = '';

  const refresh = async (): Promise<BlockerConfig | null> => {
    try {
      const raw = await fsp.readFile(opts.path, 'utf8');
      if (raw === lastRaw) return cached;
      lastRaw = raw;
      const parsed = JSON.parse(raw);
      const { config } = migrateConfig(parsed);
      const next = blockerConfigSchema.parse(config) as BlockerConfig;
      cached = next;
      return next;
    } catch (err: any) {
      if (err.code !== 'ENOENT') opts.onError?.(err);
      cached = null;
      lastRaw = '';
      return null;
    }
  };

  await refresh();

  const watcher: FSWatcher = chokidar.watch(opts.path, {
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    ignoreInitial: true,
  });

  const handle = async () => {
    const next = await refresh();
    if (next) opts.onChange(next);
  };

  watcher.on('add', handle);
  watcher.on('change', handle);
  watcher.on('error', (err) => opts.onError?.(err));

  return {
    current: () => cached,
    refresh,
    close: () => watcher.close(),
  };
}
