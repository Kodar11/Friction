import { evaluate, minuteOfDay } from '../shared/scheduleEngine.js';
import { SCHEDULE_TICK_MS } from '../shared/constants.js';
import type { BlockerConfig, ScheduleEvaluation } from '../shared/types.js';
import { applyHosts, removeManagedRegion } from './hostsWriter/index.js';
import { flushDns } from './dnsFlush.js';
import type { Logger } from './logger.js';

/**
 * The scheduler ticks every 60s, evaluates the schedule against the current
 * config, and reconciles the hosts file. It also reconciles immediately
 * whenever the config changes (called externally via `apply`).
 *
 * Reconciliation is idempotent: if the desired hosts set hasn't changed since
 * last apply, we skip the file write and the DNS flush.
 */

export interface SchedulerHandle {
  /** Force re-evaluation now (e.g. after a config change). */
  apply: (cfg: BlockerConfig | null) => Promise<void>;
  /** Most recent evaluation. */
  lastEvaluation: () => ScheduleEvaluation | null;
  /** Stop the tick. */
  stop: () => void;
}

export interface SchedulerOpts {
  /** Returns the latest config, or null if not yet loaded / removed. */
  getConfig: () => BlockerConfig | null;
  logger: Logger;
  /** Override hosts file path for tests. */
  hostsPath?: string;
  /** Override tick interval for tests. */
  tickMs?: number;
  /** Called after each successful apply with the new evaluation. */
  onApplied?: (evalResult: ScheduleEvaluation) => void;
  /** Called when apply fails. */
  onError?: (message: string) => void;
}

export function startScheduler(opts: SchedulerOpts): SchedulerHandle {
  let lastSitesKey = '__init__';
  let lastEval: ScheduleEvaluation | null = null;

  const apply = async (cfg: BlockerConfig | null): Promise<void> => {
    try {
      if (!cfg) {
        // No config: ensure no managed region remains.
        const removed = await removeManagedRegion(opts.hostsPath);
        if (removed) {
          opts.logger.info('No config present; cleared managed hosts region.');
          await flushDns();
        }
        lastSitesKey = '';
        lastEval = null;
        return;
      }

      const evalResult = evaluate(cfg, minuteOfDay(new Date()));
      lastEval = evalResult;
      const key = evalResult.sites.join('|');

      if (key === lastSitesKey) return;

      const changed = await applyHosts({
        hosts: evalResult.sites,
        activeGroupNames: evalResult.activeGroups.map((g) => g.groupName),
        hostsPath: opts.hostsPath,
      });

      if (changed) {
        opts.logger.info(
          `Hosts updated: ${evalResult.sites.length} entries; active groups=[${evalResult.activeGroups
            .map((g) => g.groupName)
            .join(', ')}]`,
        );
        const flush = await flushDns();
        if (!flush.ok) opts.logger.warn(`DNS flush failed: ${flush.error}`);
      }

      lastSitesKey = key;
      opts.onApplied?.(evalResult);
    } catch (err: any) {
      const message = err?.message ?? String(err);
      opts.logger.error(`Scheduler tick failed: ${message}`);
      opts.onError?.(message);
    }
  };

  const interval = setInterval(() => {
    void apply(opts.getConfig());
  }, opts.tickMs ?? SCHEDULE_TICK_MS);

  // Run an initial pass right away.
  void apply(opts.getConfig());

  return {
    apply,
    lastEvaluation: () => lastEval,
    stop: () => clearInterval(interval),
  };
}
