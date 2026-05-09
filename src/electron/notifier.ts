import { evaluate, minuteOfDay, nextChangeAt } from '../shared/scheduleEngine.js';
import { MINUTES_PER_DAY } from '../shared/constants.js';
import type { BlockerConfig } from '../shared/types.js';
import type { Logger } from '../service/logger.js';
import { showNotification } from './notifications.js';

/**
 * Schedules the two transition notifications:
 *   1. "Free time starts in 5 min" — block → free transition, fires 5 min before
 *   2. "10 minutes left of free time" — free → block transition, fires 10 min before
 *
 * Strategy: a single re-arming setTimeout. Each tick we look up the next
 * transition, schedule for `transitionTime - leadMs`, and fire when it lands.
 * We dedupe by stamping a "fired key" so the same transition can't fire twice
 * if e.g. the user dismisses the toast.
 *
 * Notifications are gated by `preferences.notificationsEnabled`. When the
 * user toggles it off, `update()` clears any pending timer.
 */

const FREE_LEAD_MS = 5 * 60_000;
const BLOCK_LEAD_MS = 10 * 60_000;

interface PendingFire {
  /** ms-from-now until the toast should appear. */
  delayMs: number;
  kind: 'pre-free' | 'pre-block';
  /** Stable key so we don't fire twice for the same transition. */
  key: string;
  /** Time of the actual transition (for the body text). */
  atMinute: number;
}

export class TransitionNotifier {
  private timer: NodeJS.Timeout | null = null;
  private firedKeys = new Set<string>();
  private currentConfig: BlockerConfig | null = null;
  private readonly logger: Logger;

  constructor(logger: Logger) { this.logger = logger; }

  /** Re-evaluate scheduling against the latest config + clock. Idempotent —
   *  safe to call from a 60s tick or on every config change. */
  update(config: BlockerConfig | null, now: Date = new Date()): void {
    this.currentConfig = config;

    // Garbage-collect dedupe keys older than today so the set doesn't grow.
    const today = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    for (const k of [...this.firedKeys]) {
      if (!k.startsWith(today)) this.firedKeys.delete(k);
    }

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (!config || !config.preferences.notificationsEnabled || !config.active) return;

    const next = computeNext(config, now);
    if (!next) return;

    if (this.firedKeys.has(next.key) || next.delayMs <= 0) return;

    this.timer = setTimeout(() => {
      this.timer = null;
      // Re-check before firing so a config change in the meantime doesn't
      // surprise the user.
      const cfg = this.currentConfig;
      if (!cfg || !cfg.preferences.notificationsEnabled || !cfg.active) return;
      this.fire(next);
      this.firedKeys.add(next.key);
      // Reschedule for the next transition.
      this.update(cfg, new Date());
    }, next.delayMs);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.firedKeys.clear();
    this.currentConfig = null;
  }

  /** Test hook: pretend we already fired this key. */
  markFired(key: string): void { this.firedKeys.add(key); }

  private fire(p: PendingFire): void {
    const at = formatHHMM(p.atMinute);
    if (p.kind === 'pre-free') {
      showNotification({
        title: 'Free time in 5 min',
        body: `Your scheduled break starts at ${at}.`,
        tag: 'pre-free',
      });
      this.logger.info(`Notif: pre-free for ${at}.`);
    } else {
      showNotification({
        title: '10 minutes of free time left',
        body: `Block starts at ${at}.`,
        tag: 'pre-block',
      });
      this.logger.info(`Notif: pre-block for ${at}.`);
    }
  }
}

/**
 * Pure: figure out which of the two notifications should fire next, when, and
 * with what dedupe key. Returns null if there's nothing to schedule.
 *
 * Algorithm:
 *  - Determine current state (any active groups now?).
 *  - Find the next minute where the active set changes.
 *  - If currently blocked → next change is block→free. Lead time = 5 min.
 *  - Else → next change is free→block. Lead time = 10 min.
 *  - delayMs = (transition wall-clock) − (lead) − now.
 */
export function computeNext(config: BlockerConfig, now: Date): PendingFire | null {
  const nowMinute = minuteOfDay(now);
  const dow = now.getDay();
  const ev = evaluate(config, nowMinute, dow);
  const next = nextChangeAt(config, nowMinute, dow);
  if (next === null) return null;

  const transitioningToFree = ev.activeGroups.length > 0;
  const lead = transitioningToFree ? FREE_LEAD_MS : BLOCK_LEAD_MS;

  // ms until the transition itself.
  let minutesAhead = (next - nowMinute + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (minutesAhead === 0) minutesAhead = MINUTES_PER_DAY;
  const transitionMs =
    minutesAhead * 60_000 - now.getSeconds() * 1000 - now.getMilliseconds();
  const delayMs = transitionMs - lead;

  // If lead would put us in the past for this transition (e.g. less than
  // 5 min until free), skip — the user already knows.
  if (delayMs <= 0) return null;

  const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  return {
    kind: transitioningToFree ? 'pre-free' : 'pre-block',
    delayMs,
    atMinute: next,
    key: `${dayKey}:${transitioningToFree ? 'free' : 'block'}:${next}`,
  };
}

function formatHHMM(m: number): string {
  const h = Math.floor(m / 60).toString().padStart(2, '0');
  const mm = (m % 60).toString().padStart(2, '0');
  return `${h}:${mm}`;
}
