import { CONFIG_FILENAME, SCHEDULE_TICK_MS } from '../shared/constants.js';
import type { BlockerConfig } from '../shared/types.js';
import { HeartbeatWriter } from './heartbeat.js';
import { startConfigWatcher, type ConfigWatcher } from './configWatcher.js';
import { startScheduler, type SchedulerHandle } from './scheduler.js';
import type { Logger } from './logger.js';

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
  const heartbeat = new HeartbeatWriter(opts.dir);
  const configName = opts.configPath.split(/[/\\]/).pop() ?? CONFIG_FILENAME;
  opts.logger.info(`Blocking runtime starting. config=${configName}`);

  let watcher: ConfigWatcher | null = null;
  let scheduler: SchedulerHandle | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

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
    },
    onError: (message) => {
      heartbeat.setLastError(message);
    },
  });

  heartbeatInterval = setInterval(() => {
    heartbeat.write(scheduler?.lastEvaluation() ?? null);
  }, Math.max(15_000, (opts.tickMs ?? SCHEDULE_TICK_MS) / 4));
  heartbeat.write(null);

  return {
    apply: async (cfg) => scheduler?.apply(cfg),
    stop: async () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      scheduler?.stop();
      await watcher?.close();
    },
  };
}