import { describe, expect, it, vi } from 'vitest';

// Notifier transitively imports `electron` for the toast wrapper. That module
// isn't available under the vitest node environment, so stub it out — we're
// only exercising pure logic here.
vi.mock('electron', () => ({
  Notification: class {
    static isSupported() { return false; }
    on() {}
    show() {}
  },
}));

import { computeNext } from '../../src/electron/notifier.js';
import type { BlockerConfig, ScheduleBlock } from '../../src/shared/types.js';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function block(start: number, end: number, days: number[] = ALL_DAYS): ScheduleBlock {
  return { id: 'b', startMinute: start, endMinute: end, days, siteGroupIds: ['g1'] };
}

function cfg(blocks: ScheduleBlock[], active: boolean = true, notifs: boolean = true): BlockerConfig {
  return {
    version: 2,
    active,
    siteGroups: [{ id: 'g1', name: 'Social', sites: ['youtube.com'] }],
    scheduleBlocks: blocks,
    preferences: {
      autoLaunchOnBoot: false,
      theme: 'system',
      showWelcomeScreen: false,
      notificationsEnabled: notifs,
      weeklySummaryEnabled: true,
    },
    hardMode: { level: 'light' },
    stats: { currentStreak: 0, longestStreak: 0, lastActiveDate: null, deactivationLog: [] },
  };
}

function at(day: number, hour: number, minute: number = 0): Date {
  // Anchor: Jan 7 2026 (Wednesday). Adjust to requested day-of-week.
  const d = new Date(2026, 0, 7);
  d.setDate(d.getDate() + (day - d.getDay()));
  d.setHours(hour, minute, 0, 0);
  return d;
}

describe('computeNext', () => {
  it('returns a pre-block notif before a same-day block', () => {
    // Schedule: block 17:00..19:00. Now: 16:30. Notif is 10 min before block.
    const now = at(3, 16, 30);
    const r = computeNext(cfg([block(17 * 60, 19 * 60)]), now);
    expect(r?.kind).toBe('pre-block');
    // 16:30 → 16:50 fire (10 min before 17:00)
    expect(r!.delayMs).toBeGreaterThan(15 * 60_000);
    expect(r!.delayMs).toBeLessThan(25 * 60_000);
    expect(r!.atMinute).toBe(17 * 60);
  });

  it('returns a pre-free notif when currently blocked', () => {
    // Block 9..17, now 16:50 → next change is exit at 17:00.
    // Lead is 5 min → fire at 16:55. delay = 5 min (minus the 50 sec).
    const now = at(3, 16, 50);
    const r = computeNext(cfg([block(9 * 60, 17 * 60)]), now);
    expect(r?.kind).toBe('pre-free');
    expect(r!.delayMs).toBeGreaterThan(0);
    expect(r!.delayMs).toBeLessThan(7 * 60_000);
  });

  it('returns null when no blocks exist', () => {
    expect(computeNext(cfg([]), at(3, 12))).toBeNull();
  });

  it('returns null when the lead time has already passed', () => {
    // Block starts at 12:01, now 12:00 → can't fire 10 min before, only 1 min.
    const now = at(3, 12, 0);
    const r = computeNext(cfg([block(12 * 60 + 1, 13 * 60)]), now);
    expect(r).toBeNull();
  });

  it('produces stable dedupe keys per day + transition', () => {
    const a = computeNext(cfg([block(17 * 60, 19 * 60)]), at(3, 16, 30));
    const b = computeNext(cfg([block(17 * 60, 19 * 60)]), at(3, 16, 31));
    expect(a?.key).toBe(b?.key);
  });
});
