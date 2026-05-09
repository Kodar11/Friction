import type { ActivityEntry, BlockerConfig, ScheduleBlock } from './types.js';
import { blockMinutesByDay } from './scheduleEngine.js';
import { MINUTES_PER_DAY } from './constants.js';

/**
 * Pure stats functions — no I/O. Inputs come from the activity log
 * (activity.jsonl) and the config; outputs feed the Stats screen and the
 * Dashboard summary.
 *
 * All time math is done in the user's *local* timezone (via Date getters)
 * so streaks and heatmaps line up with how the user experiences a "day".
 */

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MIN;
const STREAK_THRESHOLD = 0.8; // 80% of scheduled time must have been blocked

export interface DayStats {
  /** ISO date YYYY-MM-DD in local time. */
  date: string;
  scheduledMinutes: number;
  actualBlockedMinutes: number;
  /**
   *   - 'counted'  → day extends a streak (had scheduled time AND ≥80% covered)
   *   - 'broken'   → day breaks a streak (had scheduled time but <80% covered)
   *   - 'neutral'  → day is skipped (no scheduled blocks at all)
   */
  status: 'counted' | 'broken' | 'neutral';
}

export interface StreakResult {
  current: number;
  longest: number;
  lastActiveDate: string | null;
}

export interface HeatmapCell {
  date: string;
  /** 0..4 — bucketed shading for the calendar. 0 = none, 4 = full coverage. */
  intensity: 0 | 1 | 2 | 3 | 4;
}

/**
 * Per-day breakdown across `days` (default 90) ending at `today` inclusive.
 * Newest day last in the returned array.
 */
export function computeDayStats(
  activityLog: ActivityEntry[],
  scheduleBlocks: ScheduleBlock[],
  today: Date = new Date(),
  days: number = 90,
): DayStats[] {
  const todayStart = startOfLocalDay(today);
  const sortedLog = [...activityLog].sort((a, b) => a.ts - b.ts);
  const out: DayStats[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(todayStart.getTime() - i * MS_PER_DAY);
    out.push(computeOneDay(dayStart, sortedLog, scheduleBlocks, today));
  }
  return out;
}

function computeOneDay(
  dayStart: Date,
  sortedLog: ActivityEntry[],
  scheduleBlocks: ScheduleBlock[],
  realNow: Date,
): DayStats {
  const dow = dayStart.getDay();
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + MS_PER_DAY;

  // For "today", we cap the eligible window at the current minute so a
  // half-finished day isn't penalised for time that hasn't happened yet.
  const isToday = dayStart.getTime() === startOfLocalDay(realNow).getTime();
  const cutoffMinute = isToday
    ? realNow.getHours() * 60 + realNow.getMinutes()
    : MINUTES_PER_DAY;

  // 1. Scheduled mask for this day-of-week.
  const scheduleMask = new Uint8Array(MINUTES_PER_DAY);
  for (const block of scheduleBlocks) {
    const byDay = blockMinutesByDay(block);
    const minutes = byDay.get(dow);
    if (!minutes) continue;
    for (const m of minutes) scheduleMask[m] = 1;
  }

  // 2. Walk the log to derive (active && blocking?) per-minute for this day.
  const activityMask = new Uint8Array(MINUTES_PER_DAY);
  let lastActive = false;
  let lastBlocking = false;
  let cursor = 0;
  // Find the most recent log entry strictly before this day starts.
  for (let i = 0; i < sortedLog.length; i++) {
    if (sortedLog[i].ts < dayStartMs) {
      lastActive = sortedLog[i].active;
      lastBlocking = sortedLog[i].blocking.length > 0;
      cursor = i + 1;
    } else {
      break;
    }
  }

  let nextTs = cursor < sortedLog.length ? sortedLog[cursor].ts : Infinity;
  for (let m = 0; m < MINUTES_PER_DAY; m++) {
    const tickMs = dayStartMs + m * MS_PER_MIN;
    while (tickMs >= nextTs && cursor < sortedLog.length) {
      lastActive = sortedLog[cursor].active;
      lastBlocking = sortedLog[cursor].blocking.length > 0;
      cursor++;
      nextTs = cursor < sortedLog.length ? sortedLog[cursor].ts : Infinity;
    }
    if (tickMs >= dayEndMs) break;
    activityMask[m] = lastActive && lastBlocking ? 1 : 0;
  }

  // 3. Count.
  let scheduledMinutes = 0;
  let actualBlockedMinutes = 0;
  for (let m = 0; m < cutoffMinute; m++) {
    if (scheduleMask[m]) scheduledMinutes++;
    if (scheduleMask[m] && activityMask[m]) actualBlockedMinutes++;
  }

  let status: DayStats['status'];
  if (scheduledMinutes === 0) {
    status = 'neutral';
  } else if (actualBlockedMinutes / scheduledMinutes >= STREAK_THRESHOLD) {
    status = 'counted';
  } else {
    status = 'broken';
  }

  return {
    date: isoDate(dayStart),
    scheduledMinutes,
    actualBlockedMinutes,
    status,
  };
}

/** Walk backwards from today for current; scan full window for longest. */
export function computeStreak(
  activityLog: ActivityEntry[],
  scheduleBlocks: ScheduleBlock[],
  today: Date = new Date(),
  windowDays: number = 365,
): StreakResult {
  const series = computeDayStats(activityLog, scheduleBlocks, today, windowDays);
  // series is oldest-first; reverse-iterate for current.
  let current = 0;
  let lastActiveDate: string | null = null;
  for (let i = series.length - 1; i >= 0; i--) {
    const d = series[i];
    if (d.status === 'broken') break;
    if (d.status === 'counted') {
      current++;
      if (lastActiveDate === null) lastActiveDate = d.date;
    }
    // 'neutral' → continue without incrementing or breaking
  }

  // Forward pass for longest.
  let running = 0;
  let longest = 0;
  for (const d of series) {
    if (d.status === 'broken') {
      running = 0;
    } else if (d.status === 'counted') {
      running++;
      if (running > longest) longest = running;
    }
  }

  return { current, longest: Math.max(longest, current), lastActiveDate };
}

/** Total minutes of scheduled blocking that were actually enforced over the
 *  given range ending at today. "Time saved" in the dashboard's sense. */
export function computeTimeSaved(
  activityLog: ActivityEntry[],
  scheduleBlocks: ScheduleBlock[],
  rangeDays: number,
  today: Date = new Date(),
): number {
  const series = computeDayStats(activityLog, scheduleBlocks, today, rangeDays);
  let total = 0;
  for (const d of series) total += d.actualBlockedMinutes;
  return total;
}

/** Adherence over `rangeDays` ending at today: actualBlocked / scheduled,
 *  expressed 0..100. Days with no scheduled time are excluded from both
 *  the numerator and denominator. */
export function computeAdherence(
  config: BlockerConfig,
  activityLog: ActivityEntry[],
  rangeDays: number,
  today: Date = new Date(),
): number {
  const series = computeDayStats(activityLog, config.scheduleBlocks, today, rangeDays);
  let scheduled = 0;
  let actual = 0;
  for (const d of series) {
    scheduled += d.scheduledMinutes;
    actual += d.actualBlockedMinutes;
  }
  if (scheduled === 0) return 0;
  return Math.round((actual / scheduled) * 100);
}

/** GitHub-style heatmap: one cell per day, bucketed 0..4 by adherence. */
export function computeHeatmap(
  activityLog: ActivityEntry[],
  scheduleBlocks: ScheduleBlock[],
  today: Date = new Date(),
  days: number = 90,
): HeatmapCell[] {
  const series = computeDayStats(activityLog, scheduleBlocks, today, days);
  return series.map((d) => ({
    date: d.date,
    intensity: bucketIntensity(d),
  }));
}

function bucketIntensity(d: DayStats): HeatmapCell['intensity'] {
  if (d.scheduledMinutes === 0) return 0;
  const ratio = d.actualBlockedMinutes / d.scheduledMinutes;
  if (ratio <= 0) return 0;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.8) return 3;
  return 4;
}

/** Local-time start-of-day (00:00:00.000) for the calendar date of `d`. */
export function startOfLocalDay(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  return out;
}

export function isoDate(d: Date): string {
  const yyyy = d.getFullYear().toString().padStart(4, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
