import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  Notification: class {
    static isSupported() { return false; }
    on() {}
    show() {}
  },
}));

import { formatSummary, nextSunday8pm } from '../../src/electron/weeklySummary.js';

describe('nextSunday8pm', () => {
  it('returns the upcoming Sunday at 20:00 from a Wednesday', () => {
    // Wed Jan 7 2026 12:00
    const from = new Date(2026, 0, 7, 12, 0, 0);
    const r = nextSunday8pm(from);
    expect(r.getDay()).toBe(0); // Sunday
    expect(r.getHours()).toBe(20);
    // Diff should be 4 days + 8 hours
    const diffH = (r.getTime() - from.getTime()) / (60 * 60 * 1000);
    expect(diffH).toBeGreaterThan(95);
    expect(diffH).toBeLessThan(105);
  });

  it('rolls forward when called exactly at Sunday 20:00', () => {
    const from = new Date(2026, 0, 11, 20, 0, 0); // Sunday Jan 11 8 PM
    const r = nextSunday8pm(from);
    // Strictly after `from`, so next Sunday
    expect(r.getTime()).toBeGreaterThan(from.getTime());
    const days = (r.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6.5);
    expect(days).toBeLessThan(7.5);
  });

  it('returns same-day Sunday before 20:00', () => {
    const from = new Date(2026, 0, 11, 12, 0, 0); // Sunday noon
    const r = nextSunday8pm(from);
    expect(r.getDate()).toBe(11);
    expect(r.getHours()).toBe(20);
  });
});

describe('formatSummary', () => {
  it('rounds whole hours without a decimal', () => {
    expect(formatSummary(120, 100, 12)).toBe('2h saved · 100% adherence · 12-day streak 🔥');
  });

  it('shows one decimal for partial hours', () => {
    expect(formatSummary(90, 75, 3)).toBe('1.5h saved · 75% adherence · 3-day streak');
  });

  it('drops the flame for streaks under 7', () => {
    expect(formatSummary(60, 50, 6)).not.toContain('🔥');
    expect(formatSummary(60, 50, 7)).toContain('🔥');
  });
});
