import { describe, expect, it } from 'vitest';
import {
  blockMinutesByDay,
  evaluate,
  isBlockActiveAt,
  isBlockActiveOn,
  minuteOfDay,
  nextChangeAt,
} from '../../src/shared/scheduleEngine.js';
import type { BlockerConfig, ScheduleBlock } from '../../src/shared/types.js';

const SOCIAL = 'g-social';
const WORK = 'g-work';
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function cfg(partial?: Partial<BlockerConfig>): BlockerConfig {
  return {
    version: 2,
    active: true,
    siteGroups: [
      { id: SOCIAL, name: 'Social', sites: ['youtube.com', 'instagram.com'] },
      { id: WORK, name: 'Work distractions', sites: ['reddit.com'] },
    ],
    scheduleBlocks: [],
    preferences: {
      autoLaunchOnBoot: false,
      theme: 'system',
      showWelcomeScreen: false,
      notificationsEnabled: true,
      weeklySummaryEnabled: true,
    },
    hardMode: { level: 'light' },
    stats: { currentStreak: 0, longestStreak: 0, lastActiveDate: null, deactivationLog: [] },
    ...partial,
  };
}

const block = (
  id: string,
  startMinute: number,
  endMinute: number,
  groups: string[],
  days: number[] = ALL_DAYS,
): ScheduleBlock => ({
  id,
  startMinute,
  endMinute,
  days,
  siteGroupIds: groups,
});

describe('isBlockActiveAt (legacy minute-only)', () => {
  it('non-wrapping: half-open interval [start, end)', () => {
    const b = block('a', 9 * 60, 17 * 60, [SOCIAL]);
    expect(isBlockActiveAt(b, 9 * 60 - 1)).toBe(false);
    expect(isBlockActiveAt(b, 9 * 60)).toBe(true);
    expect(isBlockActiveAt(b, 12 * 60)).toBe(true);
    expect(isBlockActiveAt(b, 17 * 60 - 1)).toBe(true);
    expect(isBlockActiveAt(b, 17 * 60)).toBe(false);
  });

  it('wraps midnight when end < start', () => {
    const b = block('a', 22 * 60, 8 * 60, [SOCIAL]);
    expect(isBlockActiveAt(b, 22 * 60)).toBe(true);
    expect(isBlockActiveAt(b, 0)).toBe(true);
    expect(isBlockActiveAt(b, 8 * 60 - 1)).toBe(true);
    expect(isBlockActiveAt(b, 8 * 60)).toBe(false);
    expect(isBlockActiveAt(b, 12 * 60)).toBe(false);
  });

  it('zero-length window is never active', () => {
    expect(isBlockActiveAt(block('a', 600, 600, [SOCIAL]), 600)).toBe(false);
  });
});

describe('isBlockActiveOn (day-aware)', () => {
  it('respects days[] filter for same-day blocks', () => {
    // Weekdays only (Mon=1 … Fri=5)
    const b = block('a', 9 * 60, 17 * 60, [SOCIAL], [1, 2, 3, 4, 5]);
    expect(isBlockActiveOn(b, 1, 12 * 60)).toBe(true);
    expect(isBlockActiveOn(b, 5, 12 * 60)).toBe(true);
    expect(isBlockActiveOn(b, 0, 12 * 60)).toBe(false); // Sun
    expect(isBlockActiveOn(b, 6, 12 * 60)).toBe(false); // Sat
  });

  it('wrap-around: late portion belongs to start day', () => {
    // Sun 22:00 → Mon 08:00, days=[Sun]
    const b = block('a', 22 * 60, 8 * 60, [SOCIAL], [0]);
    expect(isBlockActiveOn(b, 0, 23 * 60)).toBe(true); // Sun 23:00 — yes
    expect(isBlockActiveOn(b, 1, 7 * 60)).toBe(true); // Mon 07:00 — yes (wrap)
    expect(isBlockActiveOn(b, 1, 8 * 60)).toBe(false); // Mon 08:00 — exclusive end
    expect(isBlockActiveOn(b, 2, 7 * 60)).toBe(false); // Tue 07:00 — no
  });
});

describe('evaluate', () => {
  it('master inactive returns empty', () => {
    const c = cfg({
      active: false,
      scheduleBlocks: [block('b1', 0, 1439, [SOCIAL])],
    });
    expect(evaluate(c, 720, 1).sites).toEqual([]);
  });

  it('empty schedule → empty active set + null next change', () => {
    const c = cfg({ scheduleBlocks: [] });
    const r = evaluate(c, 720, 1);
    expect(r.sites).toEqual([]);
    expect(r.activeGroups).toEqual([]);
    expect(r.nextChangeAtMinute).toBeNull();
  });

  it('overlapping blocks union their groups', () => {
    const c = cfg({
      scheduleBlocks: [
        block('b1', 9 * 60, 12 * 60, [SOCIAL]),
        block('b2', 10 * 60, 11 * 60, [WORK]),
      ],
    });
    const r = evaluate(c, 10 * 60 + 30, 1);
    expect(r.sites.sort()).toEqual(['instagram.com', 'reddit.com', 'youtube.com']);
  });

  it('honours days filter — weekday-only block does not fire on weekends', () => {
    const c = cfg({
      scheduleBlocks: [block('b', 9 * 60, 17 * 60, [SOCIAL], [1, 2, 3, 4, 5])],
    });
    expect(evaluate(c, 12 * 60, 1).sites).not.toEqual([]); // Mon
    expect(evaluate(c, 12 * 60, 0).sites).toEqual([]); // Sun
    expect(evaluate(c, 12 * 60, 6).sites).toEqual([]); // Sat
  });

  it('exact minute boundary: end exclusive, start inclusive', () => {
    const c = cfg({ scheduleBlocks: [block('b', 480, 600, [SOCIAL])] });
    expect(evaluate(c, 479, 1).sites).toEqual([]);
    expect(evaluate(c, 480, 1).sites).not.toEqual([]);
    expect(evaluate(c, 599, 1).sites).not.toEqual([]);
    expect(evaluate(c, 600, 1).sites).toEqual([]);
  });

  it('dedupes sites across groups', () => {
    const c: BlockerConfig = {
      ...cfg(),
      siteGroups: [
        { id: 'a', name: 'A', sites: ['youtube.com'] },
        { id: 'b', name: 'B', sites: ['youtube.com', 'reddit.com'] },
      ],
      scheduleBlocks: [block('b1', 0, 1439, ['a', 'b'])],
    };
    expect(evaluate(c, 600, 1).sites).toEqual(['reddit.com', 'youtube.com']);
  });

  it('ignores unknown siteGroupIds', () => {
    const c = cfg({
      scheduleBlocks: [block('b1', 0, 1439, [SOCIAL, 'ghost'])],
    });
    expect(evaluate(c, 600, 1).activeGroups.map((g) => g.groupId)).toEqual([SOCIAL]);
  });
});

describe('nextChangeAt', () => {
  it('returns next boundary where set actually changes', () => {
    const c = cfg({ scheduleBlocks: [block('b', 9 * 60, 17 * 60, [SOCIAL])] });
    expect(nextChangeAt(c, 8 * 60, 1)).toBe(9 * 60);
    expect(nextChangeAt(c, 12 * 60, 1)).toBe(17 * 60);
  });

  it('null when no blocks', () => {
    expect(nextChangeAt(cfg({ scheduleBlocks: [] }), 0, 1)).toBeNull();
  });

  it('skips boundaries that do not change the active set', () => {
    const c = cfg({
      scheduleBlocks: [
        block('a', 9 * 60, 12 * 60, [SOCIAL]),
        block('b', 12 * 60, 17 * 60, [SOCIAL]),
      ],
    });
    expect(nextChangeAt(c, 10 * 60, 1)).toBe(17 * 60);
  });
});

describe('blockMinutesByDay', () => {
  it('same-day block fills only listed start days', () => {
    const b = block('a', 9 * 60, 11 * 60, [SOCIAL], [1, 3]);
    const m = blockMinutesByDay(b);
    expect(m.get(1)?.size).toBe(120);
    expect(m.get(3)?.size).toBe(120);
    expect(m.get(2)).toBeUndefined();
  });

  it('wrap-around splits midnight overflow into next calendar day', () => {
    // Sun 22:00 → Mon 08:00, days=[Sun=0]
    const b = block('a', 22 * 60, 8 * 60, [SOCIAL], [0]);
    const m = blockMinutesByDay(b);
    // Sunday: 22:00..23:59 = 120 minutes (1320..1439)
    expect(m.get(0)?.size).toBe(120);
    // Monday: 00:00..08:00 exclusive = 480 minutes
    expect(m.get(1)?.size).toBe(480);
  });
});

describe('minuteOfDay', () => {
  it('extracts minutes from a Date', () => {
    const d = new Date();
    d.setHours(13, 45, 30);
    expect(minuteOfDay(d)).toBe(13 * 60 + 45);
  });
});
