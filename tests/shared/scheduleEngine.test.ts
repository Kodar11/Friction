import { describe, expect, it } from 'vitest';
import { evaluate, isBlockActiveAt, minuteOfDay, nextChangeAt } from '../../src/shared/scheduleEngine.js';
import type { BlockerConfig, ScheduleBlock } from '../../src/shared/types.js';

const SOCIAL = 'g-social';
const WORK = 'g-work';

function cfg(partial?: Partial<BlockerConfig>): BlockerConfig {
  return {
    version: 1,
    active: true,
    siteGroups: [
      { id: SOCIAL, name: 'Social', sites: ['youtube.com', 'instagram.com'] },
      { id: WORK, name: 'Work distractions', sites: ['reddit.com'] },
    ],
    scheduleBlocks: [],
    preferences: { autoLaunchOnBoot: false, theme: 'system', showWelcomeScreen: false },
    ...partial,
  };
}

const block = (id: string, startMinute: number, endMinute: number, groups: string[]): ScheduleBlock => ({
  id,
  startMinute,
  endMinute,
  siteGroupIds: groups,
});

describe('isBlockActiveAt', () => {
  it('non-wrapping: half-open interval [start, end)', () => {
    const b = block('a', 9 * 60, 17 * 60, [SOCIAL]);
    expect(isBlockActiveAt(b, 9 * 60 - 1)).toBe(false);
    expect(isBlockActiveAt(b, 9 * 60)).toBe(true);
    expect(isBlockActiveAt(b, 12 * 60)).toBe(true);
    expect(isBlockActiveAt(b, 17 * 60 - 1)).toBe(true);
    expect(isBlockActiveAt(b, 17 * 60)).toBe(false); // exact end = inactive
  });

  it('wraps midnight when end < start', () => {
    const b = block('a', 22 * 60, 8 * 60, [SOCIAL]);
    expect(isBlockActiveAt(b, 22 * 60)).toBe(true);
    expect(isBlockActiveAt(b, 23 * 60)).toBe(true);
    expect(isBlockActiveAt(b, 0)).toBe(true);
    expect(isBlockActiveAt(b, 8 * 60 - 1)).toBe(true);
    expect(isBlockActiveAt(b, 8 * 60)).toBe(false);
    expect(isBlockActiveAt(b, 12 * 60)).toBe(false);
  });

  it('zero-length window is never active', () => {
    const b = block('a', 600, 600, [SOCIAL]);
    expect(isBlockActiveAt(b, 600)).toBe(false);
    expect(isBlockActiveAt(b, 0)).toBe(false);
  });
});

describe('evaluate', () => {
  it('master inactive returns empty', () => {
    const c = cfg({
      active: false,
      scheduleBlocks: [block('b1', 0, 1439, [SOCIAL])],
    });
    expect(evaluate(c, 720).sites).toEqual([]);
    expect(evaluate(c, 720).activeGroups).toEqual([]);
  });

  it('empty schedule returns empty active set with null next change', () => {
    const c = cfg({ scheduleBlocks: [] });
    const r = evaluate(c, 720);
    expect(r.sites).toEqual([]);
    expect(r.activeGroups).toEqual([]);
    expect(r.nextChangeAtMinute).toBeNull();
  });

  it('overlapping blocks union their site groups', () => {
    const c = cfg({
      scheduleBlocks: [
        block('b1', 9 * 60, 12 * 60, [SOCIAL]),
        block('b2', 10 * 60, 11 * 60, [WORK]),
      ],
    });
    const r = evaluate(c, 10 * 60 + 30);
    expect(r.sites.sort()).toEqual(['instagram.com', 'reddit.com', 'youtube.com']);
    expect(r.activeGroups.map((g) => g.groupId).sort()).toEqual([SOCIAL, WORK].sort());
  });

  it('single block covering near 24h works', () => {
    // 00:00 -> 23:59 = active for 23h59m
    const c = cfg({ scheduleBlocks: [block('b', 0, 1439, [SOCIAL])] });
    expect(evaluate(c, 0).sites).toContain('youtube.com');
    expect(evaluate(c, 1438).sites).toContain('youtube.com');
    expect(evaluate(c, 1439).sites).toEqual([]); // [0, 1439) excludes 1439
  });

  it('exact minute boundary: end is exclusive, start is inclusive', () => {
    const c = cfg({ scheduleBlocks: [block('b', 480, 600, [SOCIAL])] });
    expect(evaluate(c, 479).sites).toEqual([]);
    expect(evaluate(c, 480).sites).not.toEqual([]);
    expect(evaluate(c, 599).sites).not.toEqual([]);
    expect(evaluate(c, 600).sites).toEqual([]);
  });

  it('dedupes sites contributed by multiple groups', () => {
    const c: BlockerConfig = {
      ...cfg(),
      siteGroups: [
        { id: 'a', name: 'A', sites: ['youtube.com'] },
        { id: 'b', name: 'B', sites: ['youtube.com', 'reddit.com'] },
      ],
      scheduleBlocks: [block('b1', 0, 1440 - 1, ['a', 'b'])],
    };
    const r = evaluate(c, 600);
    expect(r.sites).toEqual(['reddit.com', 'youtube.com']);
  });

  it('ignores siteGroupIds that reference unknown groups', () => {
    const c = cfg({
      scheduleBlocks: [block('b1', 0, 1439, [SOCIAL, 'ghost'])],
    });
    expect(evaluate(c, 600).activeGroups.map((g) => g.groupId)).toEqual([SOCIAL]);
  });
});

describe('nextChangeAt', () => {
  it('returns next boundary where active set actually changes', () => {
    const c = cfg({ scheduleBlocks: [block('b', 9 * 60, 17 * 60, [SOCIAL])] });
    expect(nextChangeAt(c, 8 * 60)).toBe(9 * 60); // entering block
    expect(nextChangeAt(c, 12 * 60)).toBe(17 * 60); // exiting block
  });

  it('returns null when no blocks exist', () => {
    expect(nextChangeAt(cfg({ scheduleBlocks: [] }), 0)).toBeNull();
  });

  it('skips boundaries that do not change the active set', () => {
    // Two adjacent blocks with the same group → boundary at 12:00 doesn't
    // change anything; the real change is at 17:00.
    const c = cfg({
      scheduleBlocks: [
        block('a', 9 * 60, 12 * 60, [SOCIAL]),
        block('b', 12 * 60, 17 * 60, [SOCIAL]),
      ],
    });
    expect(nextChangeAt(c, 10 * 60)).toBe(17 * 60);
  });
});

describe('minuteOfDay', () => {
  it('extracts minutes from a Date', () => {
    const d = new Date();
    d.setHours(13, 45, 30);
    expect(minuteOfDay(d)).toBe(13 * 60 + 45);
  });
});
