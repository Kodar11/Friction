import { CONFIG_FILENAME, SCHEDULE_TICK_MS } from '../shared/constants.js';
import type { BlockerConfig } from '../shared/types.js';
import { HeartbeatWriter } from './heartbeat.js';
import { startConfigWatcher, type ConfigWatcher } from './configWatcher.js';
import { startScheduler, type SchedulerHandle } from './scheduler.js';
import { ActivityLogger, shouldLogChange } from './activityLogger.js';
import type { Logger } from './logger.js';
import { APP_VERSION, CONFIG_VERSION } from '../shared/version.js';

export interface BlockingRuntime {
  apply: (cfg: BlockerConfig | null) => Promise<void>;
  stop: () => Promise<void>;
}

export interface BlockingRuntimeOpts {
  dir: string;
  logger: Logger;
  configPath: string;
  hostsPath?: string;
  tickMs?: number;
}

export async function startBlockingRuntime(opts: BlockingRuntimeOpts): Promise<BlockingRuntime> {
  const heartbeat = new HeartbeatWriter(opts.dir, {
    runtimeVersion: APP_VERSION,
    schemaVersion: CONFIG_VERSION,
  });
  const activity = new ActivityLogger({ dir: opts.dir });
  const configName = opts.configPath.split(/[/\\]/).pop() ?? CONFIG_FILENAME;
  opts.logger.info(`Blocking runtime starting. config=${configName}`);

  let watcher: ConfigWatcher | null = null;
  let scheduler: SchedulerHandle | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let pruneInterval: ReturnType<typeof setInterval> | null = null;
  // Track the most recent state we logged so we can dedupe per-tick noise.
  let lastLogged: { active: boolean; blocking: string[] } | null = null;

  watcher = await startConfigWatcher({
    path: opts.configPath,
    onChange: (cfg) => {
      opts.logger.info('Config changed; re-evaluating blocking state.');
      void scheduler?.apply(cfg);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      opts.logger.error(`Config watcher error: ${msg}`);
      heartbeat.setLastError(msg);
    },
  });

  scheduler = startScheduler({
    getConfig: () => watcher?.current() ?? null,
    logger: opts.logger,
    hostsPath: opts.hostsPath,
    tickMs: opts.tickMs ?? SCHEDULE_TICK_MS,
    onApplied: (ev) => {
      heartbeat.setLastError(null);
      heartbeat.write(ev);
      // Activity log: only append on actual state changes so we don't grow
      // the file by 1 line per minute for no reason.
      const cfg = watcher?.current();
      const next = {
        active: !!cfg?.active,
        blocking: ev.activeGroups.map((g) => g.groupName),
      };
      if (shouldLogChange(lastLogged, next)) {
        lastLogged = next;
        void activity.append({ ts: Date.now(), ...next });
      }
    },
    onError: ({ kind, message }) => {
      heartbeat.setLastError(message, kind);
      heartbeat.write(scheduler?.lastEvaluation() ?? null);
    },
    onFlushed: (at) => {
      heartbeat.markFlushed(at);
      heartbeat.write(scheduler?.lastEvaluation() ?? null);
    },
  });

  heartbeatInterval = setInterval(() => {
    heartbeat.write(scheduler?.lastEvaluation() ?? null);
  }, Math.max(15_000, (opts.tickMs ?? SCHEDULE_TICK_MS) / 4));
  heartbeat.write(null);

  // Daily prune so activity.jsonl stays bounded (default 90-day window).
  // First pass is fire-and-forget shortly after startup.
  setTimeout(() => void activity.prune().catch(() => undefined), 5_000);
  pruneInterval = setInterval(
    () => void activity.prune().catch(() => undefined),
    24 * 60 * 60 * 1000,
  );

  return {
    apply: async (cfg) => scheduler?.apply(cfg),
    stop: async () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (pruneInterval) clearInterval(pruneInterval);
      scheduler?.stop();
      await watcher?.close();
    },
  };
}