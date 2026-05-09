import { describe, expect, it } from 'vitest';
import {
  appendDeactivation,
  buildCancelledEntry,
  buildDeactivationEntry,
  classifyDeactivateRequest,
  closeOpenDeactivation,
  DEACTIVATION_LOG_CAP,
  HARD_COUNTDOWN_MS,
  REQUIRED_PHRASE,
} from '../../src/electron/hardMode.js';
import type { BlockerConfig, HardModeLevel, ScheduleBlock } from '../../src/shared/types.js';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function block(startMinute: number, endMinute: number, days: number[] = ALL_DAYS): ScheduleBlock {
  return { id: 'b', startMinute, endMinute, days, siteGroupIds: ['g1'] };
}

function cfg(level: HardModeLevel, blocks: ScheduleBlock[] = [], active: boolean = true): BlockerConfig {
  return {
    version: 2,
    active,
    siteGroups: [{ id: 'g1', name: 'Social', sites: ['youtube.com'] }],
    scheduleBlocks: blocks,
    preferences: {
      autoLaunchOnBoot: false,
      theme: 'system',
      showWelcomeScreen: false,
      notificationsEnabled: true,
      weeklySummaryEnabled: true,
    },
    hardMode: { level },
    stats: { currentStreak: 0, longestStreak: 0, lastActiveDate: null, deactivationLog: [] },
  };
}

/** A Date at the given local hour:minute on a known weekday. */
function at(day: number, hour: number, minute: number = 0): Date {
  // pick a Wednesday (Jan 7 2026 is Wednesday → dayOfWeek=3)
  const d = new Date(2026, 0, 7);
  // adjust to requested day of week
  d.setDate(d.getDate() + (day - d.getDay()));
  d.setHours(hour, minute, 0, 0);
  return d;
}

describe('classifyDeactivateRequest', () => {
  it('off → allowed (no friction)', () => {
    expect(classifyDeactivateRequest(cfg('off'))).toMatchObject({
      result: 'allowed',
      level: 'off',
    });
  });

  it('light → needs-confirm', () => {
    expect(classifyDeactivateRequest(cfg('light'))).toMatchObject({
      result: 'needs-confirm',
      level: 'light',
    });
  });

  it('medium → needs-phrase with required phrase', () => {
    const r = classifyDeactivateRequest(cfg('medium'));
    expect(r.result).toBe('needs-phrase');
    expect(r.requiredPhrase).toBe(REQUIRED_PHRASE);
  });

  it('hard → needs-countdown of 5 minutes', () => {
    const r = classifyDeactivateRequest(cfg('hard'));
    expect(r.result).toBe('needs-countdown');
    expect(r.countdownMs).toBe(HARD_COUNTDOWN_MS);
  });

  it('extreme + currently in a block window → blocked', () => {
    const c = cfg('extreme', [block(9 * 60, 17 * 60)]);
    // Wednesday 12:00, schedule covers 9–17 every day → in window
    const r = classifyDeactivateRequest(c, at(3, 12));
    expect(r.result).toBe('blocked');
  });

  it('extreme + outside any block window → needs-countdown (same as hard)', () => {
    const c = cfg('extreme', [block(9 * 60, 17 * 60)]);
    // Wednesday 8:00 — before window
    const r = classifyDeactivateRequest(c, at(3, 8));
    expect(r.result).toBe('needs-countdown');
    expect(r.countdownMs).toBe(HARD_COUNTDOWN_MS);
  });
});

describe('buildDeactivationEntry / buildCancelledEntry', () => {
  it('hard entry preserves the reason', () => {
    const e = buildDeactivationEntry('hard', 'work emergency', 1000);
    expect(e).toEqual({
      timestamp: 1000,
      hardModeLevel: 'hard',
      reason: 'work emergency',
      reactivatedAt: null,
    });
  });

  it('light/medium/off entries drop the reason (null)', () => {
    expect(buildDeactivationEntry('light', 'should be ignored').reason).toBeNull();
    expect(buildDeactivationEntry('medium', 'should be ignored').reason).toBeNull();
    expect(buildDeactivationEntry('off', 'should be ignored').reason).toBeNull();
  });

  it('cancelled entry carries the cancelled flag', () => {
    const e = buildCancelledEntry('hard', 'changed my mind', 1000);
    expect(e.cancelled).toBe(true);
    expect(e.reason).toBe('changed my mind');
  });
});

describe('appendDeactivation + cap', () => {
  it('inserts newest-first and caps at DEACTIVATION_LOG_CAP', () => {
    let log = [] as ReturnType<typeof buildDeactivationEntry>[];
    for (let i = 0; i < DEACTIVATION_LOG_CAP + 5; i++) {
      log = appendDeactivation(log, buildDeactivationEntry('light', null, i));
    }
    expect(log.length).toBe(DEACTIVATION_LOG_CAP);
    // Newest at index 0
    expect(log[0].timestamp).toBe(DEACTIVATION_LOG_CAP + 4);
    // Oldest preserved is the entry at timestamp=5 (4 oldest dropped)
    expect(log[log.length - 1].timestamp).toBe(5);
  });
});

describe('closeOpenDeactivation', () => {
  it('stamps reactivatedAt on the most recent open entry', () => {
    const log = [
      buildDeactivationEntry('hard', 'reason', 100),
      buildDeactivationEntry('light', null, 50),
    ];
    const next = closeOpenDeactivation(log, 999);
    expect(next[0].reactivatedAt).toBe(999);
    expect(next[1].reactivatedAt).toBeNull(); // older one untouched
  });

  it('skips cancelled entries when looking for the open one', () => {
    const log = [
      buildCancelledEntry('hard', 'reason', 100),
      buildDeactivationEntry('hard', 'reason', 90),
    ];
    const next = closeOpenDeactivation(log, 999);
    expect(next[0].reactivatedAt).toBeNull(); // cancelled entry stays open
    expect(next[1].reactivatedAt).toBe(999); // older non-cancelled gets closed
  });

  it('no-op when nothing is open', () => {
    const closed = buildDeactivationEntry('hard', 'reason', 100);
    closed.reactivatedAt = 200;
    const log = [closed];
    expect(closeOpenDeactivation(log, 999)).toBe(log);
  });
});
