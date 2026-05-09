import type { BlockerConfig, ScheduleBlock, ScheduleEvaluation, SiteGroup } from './types.js';
import { MINUTES_PER_DAY, DAYS_PER_WEEK } from './constants.js';

/**
 * Pure: given a config and a moment in time, return what should be blocked
 * right now and when the active set will next change.
 *
 * v2: each block carries `days: number[]` (0=Sun … 6=Sat). A block contributes
 * to the active set at (dow, minute) if `days.includes(startDayOfWeek)` AND
 * the minute lies within the block's window. For wrap-around blocks (end <
 * start), the late-night portion is "scheduled on" startDay; the early-morning
 * portion is "scheduled on" the same startDay but lands on (startDay+1).
 *
 * Overlapping blocks union their site groups.
 */
export function evaluate(
  config: BlockerConfig,
  nowMinute: number,
  nowDayOfWeek: number = new Date().getDay(),
): ScheduleEvaluation {
  const minute = normalizeMinute(nowMinute);
  const dow = normalizeDay(nowDayOfWeek);

  if (!config.active) {
    return {
      sites: [],
      activeGroups: [],
      nextChangeAtMinute: null,
    };
  }

  const groupById = new Map<string, SiteGroup>(config.siteGroups.map((g) => [g.id, g]));

  const activeGroupIds = new Set<string>();
  for (const block of config.scheduleBlocks) {
    if (isBlockActiveOn(block, dow, minute)) {
      for (const gid of block.siteGroupIds) {
        if (groupById.has(gid)) activeGroupIds.add(gid);
      }
    }
  }

  const activeGroups = [...activeGroupIds]
    .map((id) => groupById.get(id)!)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((g) => ({ groupId: g.id, groupName: g.name }));

  const sites = uniqueSorted(
    [...activeGroupIds].flatMap((id) => groupById.get(id)?.sites ?? []),
  );

  return {
    sites,
    activeGroups,
    nextChangeAtMinute: nextChangeAt(config, minute, dow),
  };
}

/**
 * True if `minute` on `dayOfWeek` falls inside the block's window.
 * Handles midnight-wrap and the days[] filter together.
 */
export function isBlockActiveOn(block: ScheduleBlock, dayOfWeek: number, minute: number): boolean {
  const { startMinute: s, endMinute: e } = block;
  if (s === e) return false; // zero-length window

  const dow = normalizeDay(dayOfWeek);

  if (s < e) {
    // Same-day block: matches only on a start day, between s..e.
    return block.days.includes(dow) && minute >= s && minute < e;
  }

  // Wrap-around: starts on a "start day" at minute s, runs until next-day at e.
  // Late-night portion (s..1440) belongs to startDay.
  // Early-morning portion (0..e) belongs to startDay+1 (today's perspective).
  if (minute >= s) {
    return block.days.includes(dow);
  }
  if (minute < e) {
    const yesterday = (dow - 1 + DAYS_PER_WEEK) % DAYS_PER_WEEK;
    return block.days.includes(yesterday);
  }
  return false;
}

/** Back-compat helper: minute-only check, ignores days filter. Tests + a
 *  handful of internal sites still call this. */
export function isBlockActiveAt(block: ScheduleBlock, minute: number): boolean {
  const { startMinute: s, endMinute: e } = block;
  if (s === e) return false;
  if (s < e) return minute >= s && minute < e;
  return minute >= s || minute < e;
}

/**
 * Find the next minute-of-day at which the union of active groups will change.
 * Same-day boundaries only — the 60s scheduler tick catches cross-day flips.
 */
export function nextChangeAt(
  config: BlockerConfig,
  nowMinute: number,
  dow: number = new Date().getDay(),
): number | null {
  const now = normalizeMinute(nowMinute);
  const boundaries = collectBoundaries(config.scheduleBlocks);
  if (boundaries.length === 0) return null;

  const currentSet = activeGroupSetAt(config, dow, now);

  const ordered = boundaries
    .map((b) => ({ b, ahead: (b - now + MINUTES_PER_DAY) % MINUTES_PER_DAY }))
    .filter((x) => x.ahead > 0)
    .sort((a, b) => a.ahead - b.ahead);

  for (const { b } of ordered) {
    if (!setsEqual(activeGroupSetAt(config, dow, b), currentSet)) {
      return b;
    }
  }
  return null;
}

function collectBoundaries(blocks: ScheduleBlock[]): number[] {
  const set = new Set<number>();
  for (const b of blocks) {
    set.add(normalizeMinute(b.startMinute));
    set.add(normalizeMinute(b.endMinute));
  }
  return [...set].sort((a, b) => a - b);
}

function activeGroupSetAt(config: BlockerConfig, dow: number, minute: number): Set<string> {
  const out = new Set<string>();
  for (const block of config.scheduleBlocks) {
    if (isBlockActiveOn(block, dow, minute)) {
      for (const gid of block.siteGroupIds) out.add(gid);
    }
  }
  return out;
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function uniqueSorted(items: string[]): string[] {
  return [...new Set(items.map((s) => s.toLowerCase()))].sort();
}

function normalizeMinute(m: number): number {
  return ((Math.floor(m) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function normalizeDay(d: number): number {
  return ((Math.floor(d) % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK;
}

/** Convenience: build "minutes since midnight" from a Date in local time. */
export function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * All (dayOfWeek, minute) tuples covered by a block, expressed as a per-day
 * Set<minute> map. Cross-week / wrap-around aware. Used by the stats engine
 * to compute scheduled vs. actual blocked time per calendar day.
 */
export function blockMinutesByDay(block: ScheduleBlock): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  if (block.startMinute === block.endMinute) return out;

  const addRange = (day: number, from: number, toExclusive: number) => {
    const norm = normalizeDay(day);
    const set = out.get(norm) ?? new Set<number>();
    for (let m = from; m < toExclusive; m++) set.add(m);
    out.set(norm, set);
  };

  for (const startDay of block.days) {
    if (block.startMinute < block.endMinute) {
      addRange(startDay, block.startMinute, block.endMinute);
    } else {
      addRange(startDay, block.startMinute, MINUTES_PER_DAY);
      addRange((startDay + 1) % DAYS_PER_WEEK, 0, block.endMinute);
    }
  }
  return out;
}
