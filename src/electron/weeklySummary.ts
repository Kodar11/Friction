import {
  computeAdherence,
  computeStreak,
  computeTimeSaved,
} from '../shared/statsEngine.js';
import type { BlockerConfig } from '../shared/types.js';
import type { Logger } from '../service/logger.js';
import type { ActivityLogger } from '../service/activityLogger.js';
import { showNotification } from './notifications.js';

/**
 * Fires a notification at Sunday 8:00 PM local time:
 *   "This week: 47h saved · 100% adherence · 12-day streak 🔥"
 *
 * Implementation: setTimeout to the next Sunday-8PM, fire, then schedule
 * the following one. Survives midnight, DST, and config changes (callers
 * call `update()` whenever preferences change).
 */

export class WeeklySummary {
  private timer: NodeJS.Timeout | null = null;
  private currentConfig: BlockerConfig | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly activity: ActivityLogger,
    /** Reads the current config when the timer fires (lazy — config may have
     *  changed since update() was called). */
    private readonly getConfig: () => Promise<BlockerConfig>,
  ) {}

  update(config: BlockerConfig | null, now: Date = new Date()): void {
    this.currentConfig = config;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!config || !config.preferences.notificationsEnabled || !config.preferences.weeklySummaryEnabled) {
      return;
    }
    const target = nextSunday8pm(now);
    const delayMs = target.getTime() - now.getTime();
    // setTimeout has a max-int32 delay; cap at ~24 days, re-arming if needed.
    const cap = 2 ** 31 - 1;
    const fireDelay = Math.min(delayMs, cap);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (delayMs > cap) {
        // Came back from the cap; re-evaluate from the new "now".
        this.update(this.currentConfig, new Date());
        return;
      }
      void this.fireAndReschedule();
    }, Math.max(0, fireDelay));
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.currentConfig = null;
  }

  private async fireAndReschedule(): Promise<void> {
    try {
      const cfg = await this.getConfig();
      // Re-check: user may have toggled it off in the meantime.
      if (!cfg.preferences.notificationsEnabled || !cfg.preferences.weeklySummaryEnabled) {
        return;
      }
      const log = await this.activity.read();
      const now = new Date();
      const minutes = computeTimeSaved(log, cfg.scheduleBlocks, 7, now);
      const adherence = computeAdherence(cfg, log, 7, now);
      const streak = computeStreak(log, cfg.scheduleBlocks, now);

      const body = formatSummary(minutes, adherence, streak.current);
      showNotification({
        title: 'Your week, in focus',
        body,
        tag: 'weekly-summary',
      });
      this.logger.info(`Notif: weekly summary "${body}"`);
    } catch (err: any) {
      this.logger.warn(`Weekly summary failed: ${err?.message ?? err}`);
    } finally {
      // Schedule next week regardless of success.
      const next = new Date();
      next.setDate(next.getDate() + 1); // ensure we step out of "this Sunday 8pm"
      this.update(this.currentConfig, next);
    }
  }
}

/** Next Sunday at 20:00 local strictly after `from`. */
export function nextSunday8pm(from: Date): Date {
  const d = new Date(from);
  // Sunday = 0
  const daysAhead = ((7 - d.getDay()) % 7);
  d.setDate(d.getDate() + daysAhead);
  d.setHours(20, 0, 0, 0);
  if (d.getTime() <= from.getTime()) {
    d.setDate(d.getDate() + 7);
  }
  return d;
}

export function formatSummary(minutes: number, adherence: number, streak: number): string {
  const hours = (minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1);
  const flame = streak >= 7 ? ' 🔥' : '';
  return `${hours}h saved · ${adherence}% adherence · ${streak}-day streak${flame}`;
}
