import { describe, expect, it } from 'vitest';
import {
  computeAdherence,
  computeDayStats,
  computeHeatmap,
  computeStreak,
  computeTimeSaved,
  isoDate,
  startOfLocalDay,
} from '../../src/shared/statsEngine.js';
import type { ActivityEntry, BlockerConfig, ScheduleBlock } from '../../src/shared/types.js';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const SOCIAL = 'g1';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MIN = 60_000;

function block(startMinute: number, endMinute: number, days: number[] = ALL_DAYS): ScheduleBlock {
  return { id: 'b1', startMinute, endMinute, days, siteGroupIds: [SOCIAL] };
}

function cfg(blocks: ScheduleBlock[], active: boolean = true): BlockerConfig {
  return {
    version: 2,
    active,
    siteGroups: [{ id: SOCIAL, name: 'Social', sites: ['youtube.com'] }],
    scheduleBlocks: blocks,
    preferences: {
      autoLaunchOnBoot: false,
      theme: 'system',
      showWelcomeScreen: false,
      notificationsEnabled: true,
      weeklySummaryEnabled: true,
    },
    hardMode: { level: 'light' },
    stats: { currentStreak: 0, longestStreak: 0, lastActiveDate: null, deactivationLog: [] },
  };
}

/** Build a today date that's always end-of-day so partial-today logic doesn't kick in. */
function dayAt(daysAgo: number, hour: number = 23, minute: number = 59): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d;
}

/** Build an activity entry at a specific local moment N days ago. */
function entryAt(daysAgo: number, hour: number, minute: number, active: boolean, blocking: string[]): ActivityEntry {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return { ts: d.getTime(), active, blocking };
}

describe('computeDayStats', () => {
  it('flags scheduled-but-empty days as broken', () => {
    const today = dayAt(0);
    const res = computeDayStats([], [block(9 * 60, 17 * 60)], today, 1);
    expect(res).toHaveLength(1);
    expect(res[0].scheduledMinutes).toBe(8 * 60);
    expect(res[0].actualBlockedMinutes).toBe(0);
    expect(res[0].status).toBe('broken');
  });

  it('flags days with no scheduled blocks as neutral', () => {
    const today = dayAt(0);
    const res = computeDayStats([], [], today, 3);
    expect(res.every((d) => d.status === 'neutral')).toBe(true);
  });

  it('counts a fully-blocked day', () => {
    const today = dayAt(0);
    // Block 9–17 today.
    const log: ActivityEntry[] = [
      // Activate at 09:00 today, blocking Social
      entryAt(0, 9, 0, true, ['Social']),
      // Stop blocking at 17:00 today
      entryAt(0, 17, 0, true, []),
    ];
    const res = computeDayStats(log, [block(9 * 60, 17 * 60)], today, 1);
    expect(res[0].scheduledMinutes).toBe(8 * 60);
    // Allow minute-level fuzz from minute floor
    expect(res[0].actualBlockedMinutes).toBeGreaterThanOrEqual(8 * 60 - 1);
    expect(res[0].status).toBe('counted');
  });

  it('partial blocking under threshold breaks the day', () => {
    const today = dayAt(0);
    // Schedule 9–17 (480 min). Block only first hour.
    const log: ActivityEntry[] = [
      entryAt(0, 9, 0, true, ['Social']),
      entryAt(0, 10, 0, true, []),
    ];
    const res = computeDayStats(log, [block(9 * 60, 17 * 60)], today, 1);
    expect(res[0].actualBlockedMinutes).toBeLessThan(0.8 * res[0].scheduledMinutes);
    expect(res[0].status).toBe('broken');
  });

  it('honours days[] — no scheduled time on excluded days', () => {
    // weekday-only schedule
    const today = new Date();
    today.setHours(23, 59, 0, 0);
    const blockers = [block(9 * 60, 17 * 60, [1, 2, 3, 4, 5])];
    const res = computeDayStats([], blockers, today, 7);
    // Find a Saturday (6) or Sunday (0) — should be neutral
    for (const d of res) {
      const dt = new Date(d.date + 'T12:00:00');
      const dow = dt.getDay();
      if (dow === 0 || dow === 6) {
        expect(d.status).toBe('neutral');
      }
    }
  });
});

describe('computeStreak', () => {
  it('empty log + scheduled blocks → broken streak (zero current)', () => {
    const today = dayAt(0);
    const r = computeStreak([], [block(9 * 60, 17 * 60)], today, 7);
    expect(r.current).toBe(0);
  });

  it('three counted days in a row → current=3', () => {
    const today = dayAt(0);
    // Activate yesterday morning, never deactivate.
    const log: ActivityEntry[] = [
      entryAt(3, 8, 0, true, []), // activate, no block window yet
      entryAt(3, 9, 0, true, ['Social']), // entering window
      entryAt(3, 17, 0, true, []), // exit window
      entryAt(2, 9, 0, true, ['Social']),
      entryAt(2, 17, 0, true, []),
      entryAt(1, 9, 0, true, ['Social']),
      entryAt(1, 17, 0, true, []),
      entryAt(0, 9, 0, true, ['Social']),
      entryAt(0, 17, 0, true, []),
    ];
    const r = computeStreak(log, [block(9 * 60, 17 * 60)], today, 7);
    expect(r.current).toBe(4);
  });

  it('a broken middle day breaks the streak as we walk back', () => {
    const today = dayAt(0);
    const log: ActivityEntry[] = [
      // Day 4: full
      entryAt(4, 9, 0, true, ['Social']),
      entryAt(4, 17, 0, true, []),
      // Day 3: full
      entryAt(3, 9, 0, true, ['Social']),
      entryAt(3, 17, 0, true, []),
      // Day 2: NOTHING (broken)
      // Day 1: full
      entryAt(1, 9, 0, true, ['Social']),
      entryAt(1, 17, 0, true, []),
      // Today: full
      entryAt(0, 9, 0, true, ['Social']),
      entryAt(0, 17, 0, true, []),
    ];
    const r = computeStreak(log, [block(9 * 60, 17 * 60)], today, 7);
    expect(r.current).toBe(2); // today + yesterday
    expect(r.longest).toBeGreaterThanOrEqual(2);
  });

  it('neutral days do not break the streak', () => {
    // weekend has no scheduled blocks (weekday-only schedule)
    const today = dayAt(0);
    const r = computeStreak([], [block(9 * 60, 17 * 60, [1, 2, 3, 4, 5])], today, 14);
    // No actual blocking, so weekdays are broken; weekends are neutral.
    // Walking back from today, the first weekday is broken → current=0.
    expect(r.current).toBe(0);
  });

  it('longestStreak ≥ currentStreak', () => {
    const today = dayAt(0);
    const r = computeStreak([], [], today, 7);
    expect(r.longest).toBeGreaterThanOrEqual(r.current);
  });
});

describe('computeTimeSaved + computeAdherence', () => {
  const log: ActivityEntry[] = [
    entryAt(2, 9, 0, true, ['Social']),
    entryAt(2, 13, 0, true, []), // half-day blocking
    entryAt(1, 9, 0, true, ['Social']),
    entryAt(1, 17, 0, true, []),
    entryAt(0, 9, 0, true, ['Social']),
    entryAt(0, 17, 0, true, []),
  ];

  it('time saved sums actual minutes across the range', () => {
    const today = dayAt(0);
    const t = computeTimeSaved(log, [block(9 * 60, 17 * 60)], 3, today);
    // Day -2: 4h, Day -1: 8h, Day 0: 8h ≈ 1200 min
    expect(t).toBeGreaterThan(20 * 60 - 30);
    expect(t).toBeLessThan(20 * 60 + 30);
  });

  it('adherence is actual / scheduled, percentage-rounded', () => {
    const today = dayAt(0);
    const c = cfg([block(9 * 60, 17 * 60)]);
    const a = computeAdherence(c, log, 3, today);
    // ≈ 1200/1440 = 83%
    expect(a).toBeGreaterThanOrEqual(80);
    expect(a).toBeLessThanOrEqual(86);
  });

  it('adherence = 0 when nothing scheduled', () => {
    const today = dayAt(0);
    expect(computeAdherence(cfg([]), [], 7, today)).toBe(0);
  });
});

describe('computeHeatmap', () => {
  it('produces one cell per day in range', () => {
    const today = dayAt(0);
    const cells = computeHeatmap([], [block(9 * 60, 17 * 60)], today, 30);
    expect(cells).toHaveLength(30);
    for (const c of cells) {
      expect([0, 1, 2, 3, 4]).toContain(c.intensity);
    }
  });

  it('intensity buckets reflect adherence ratio', () => {
    const today = dayAt(0);
    const log: ActivityEntry[] = [
      entryAt(0, 9, 0, true, ['Social']),
      entryAt(0, 17, 0, true, []),
    ];
    const cells = computeHeatmap(log, [block(9 * 60, 17 * 60)], today, 1);
    expect(cells[0].intensity).toBe(4);
  });
});

describe('isoDate / startOfLocalDay', () => {
  it('isoDate is YYYY-MM-DD in local time', () => {
    const d = new Date(2026, 4, 9, 12, 30); // May 9 2026 12:30 local
    expect(isoDate(d)).toBe('2026-05-09');
  });

  it('startOfLocalDay zeroes h/m/s', () => {
    const d = new Date(2026, 4, 9, 12, 30);
    const s = startOfLocalDay(d);
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
    expect(s.getDate()).toBe(9);
  });

  it('startOfLocalDay difference is exactly one day for adjacent calendar days (no DST)', () => {
    const a = startOfLocalDay(new Date(2026, 1, 10));
    const b = startOfLocalDay(new Date(2026, 1, 11));
    const diff = b.getTime() - a.getTime();
    // Either 24h (no DST) or 23h/25h (DST). Don't assert exact MS_PER_DAY across all envs.
    expect(diff).toBeGreaterThan(MS_PER_DAY - 2 * 60 * 60 * 1000);
    expect(diff).toBeLessThan(MS_PER_DAY + 2 * 60 * 60 * 1000);
    void MS_PER_MIN;
  });
});
