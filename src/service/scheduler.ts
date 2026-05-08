import { evaluate, minuteOfDay } from '../shared/scheduleEngine.js';
import { SCHEDULE_TICK_MS } from '../shared/constants.js';
import type { BlockerConfig, ScheduleEvaluation } from '../shared/types.js';
import { applyHosts, HostsPermissionError, removeManagedRegion } from './hostsWriter/index.js';
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

export type SchedulerErrorKind = 'permission' | 'other';

export interface SchedulerError {
  kind: SchedulerErrorKind;
  message: string;
}

export interface SchedulerHandle {
  apply: (cfg: BlockerConfig | null) => Promise<void>;
  lastEvaluation: () => ScheduleEvaluation | null;
  stop: () => void;
}

export interface SchedulerOpts {
  getConfig: () => BlockerConfig | null;
  logger: Logger;
  hostsPath?: string;
  tickMs?: number;
  onApplied?: (evalResult: ScheduleEvaluation) => void;
  /** Called when apply fails. Includes a kind so the UI can render an actionable message. */
  onError?: (err: SchedulerError) => void;
  /** Called after each successful DNS flush, with the wall-clock ms timestamp. */
  onFlushed?: (at: number) => void;
}

export function startScheduler(opts: SchedulerOpts): SchedulerHandle {
  let lastSitesKey = '__init__';
  let lastEval: ScheduleEvaluation | null = null;
  let lastErrorKind: SchedulerErrorKind | null = null;
  // Serialize apply() calls. Two concurrent applies would re-render the hosts
  // region with different timestamps and double-write. They'd also race on
  // lastSitesKey/lastErrorKind. Keep it simple: one at a time.
  let chain: Promise<void> = Promise.resolve();

  const doApply = async (cfg: BlockerConfig | null): Promise<void> => {
    try {
      if (!cfg) {
        try {
          const removed = await removeManagedRegion(opts.hostsPath);
          if (removed) {
            opts.logger.info('No config present; cleared managed hosts region.');
            await flushDns();
          }
        } catch (err) {
          // If we can't even read/clean, surface that — but don't crash.
          handleError(err);
          return;
        }
        lastSitesKey = '';
        lastEval = null;
        lastErrorKind = null;
        return;
      }

      const evalResult = evaluate(cfg, minuteOfDay(new Date()));
      lastEval = evalResult;
      const key = evalResult.sites.join('|');

      // Skip writes when we already wrote this exact set of hosts AND the last
      // attempt didn't fail. If it failed, retry every tick so a now-elevated
      // process can succeed without the user touching anything.
      if (key === lastSitesKey && lastErrorKind === null) return;

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
        if (flush.ok) {
          opts.logger.info('DNS flushed (ipconfig + ARP + destination cache).');
          opts.onFlushed?.(Date.now());
        } else {
          opts.logger.warn(`DNS flush failed: ${flush.error}`);
        }
      }

      lastSitesKey = key;
      lastErrorKind = null;
      opts.onApplied?.(evalResult);
    } catch (err) {
      handleError(err);
    }
  };

  const apply = (cfg: BlockerConfig | null): Promise<void> => {
    const next = chain.then(() => doApply(cfg));
    chain = next.catch(() => undefined);
    return next;
  };

  const handleError = (err: unknown) => {
    const isPerm = err instanceof HostsPermissionError;
    const message = err instanceof Error ? err.message : String(err);
    if (isPerm) {
      // Don't spam the log every tick — log at info level and let the UI take it from here.
      if (lastErrorKind !== 'permission') {
        opts.logger.warn(`Hosts file write permission denied — blocking is on hold until elevated.`);
      }
      lastErrorKind = 'permission';
      opts.onError?.({ kind: 'permission', message });
    } else {
      if (lastErrorKind !== 'other') {
        opts.logger.error(`Scheduler tick failed: ${message}`);
      }
      lastErrorKind = 'other';
      opts.onError?.({ kind: 'other', message });
    }
  };

  const interval = setInterval(() => {
    void apply(opts.getConfig());
  }, opts.tickMs ?? SCHEDULE_TICK_MS);

  void apply(opts.getConfig());

  return {
    apply,
    lastEvaluation: () => lastEval,
    stop: () => clearInterval(interval),
  };
}
