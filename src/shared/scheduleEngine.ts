import type { BlockerConfig, ScheduleBlock, ScheduleEvaluation, SiteGroup } from './types.js';
import { MINUTES_PER_DAY } from './constants.js';

/**
 * Pure: given a config and a moment in time, return what should be blocked
 * right now and when the active set will next change.
 *
 * A schedule block is active if `nowMinute` falls inside [start, end) where
 * blocks may wrap midnight (end <= start means start..1439 ∪ 0..end).
 *
 * Overlapping blocks union their site groups (decision #11).
 */
export function evaluate(config: BlockerConfig, nowMinute: number): ScheduleEvaluation {
  const minute = normalizeMinute(nowMinute);

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
    if (isBlockActiveAt(block, minute)) {
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
    [...activeGroupIds].flatMap((id) => groupById.get(id)?.sites ?? [])
  );

  return {
    sites,
    activeGroups,
    nextChangeAtMinute: nextChangeAt(config, minute),
  };
}

/** True if `minute` is in [start, end) for the given block, with midnight wrap. */
export function isBlockActiveAt(block: ScheduleBlock, minute: number): boolean {
  const { startMinute: s, endMinute: e } = block;
  if (s === e) {
    // Zero-length window: never active. (24h coverage is expressed by start=0,end=0
    // explicitly disallowed; user must use two blocks or any non-zero window.)
    return false;
  }
  if (s < e) return minute >= s && minute < e;
  // wraps: active in [s, 1440) ∪ [0, e)
  return minute >= s || minute < e;
}

/**
 * Find the next minute-of-day at which the union of active groups will change.
 * Returns null if it never changes (e.g. no blocks).
 *
 * We do this by evaluating the active group set at every block boundary
 * (start and end minute) starting from `now+1`, scanning forward up to a full
 * day, and returning the first boundary where the set differs from now.
 */
export function nextChangeAt(config: BlockerConfig, nowMinute: number): number | null {
  const now = normalizeMinute(nowMinute);
  const boundaries = collectBoundaries(config.scheduleBlocks);
  if (boundaries.length === 0) return null;

  const currentSet = activeGroupSetAt(config, now);

  // Sort boundaries by minutes-ahead (chronological from `now`, wrapping once).
  const ordered = boundaries
    .map((b) => ({ b, ahead: (b - now + MINUTES_PER_DAY) % MINUTES_PER_DAY }))
    .filter((x) => x.ahead > 0)
    .sort((a, b) => a.ahead - b.ahead);

  for (const { b } of ordered) {
    if (!setsEqual(activeGroupSetAt(config, b), currentSet)) {
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

function activeGroupSetAt(config: BlockerConfig, minute: number): Set<string> {
  const out = new Set<string>();
  for (const block of config.scheduleBlocks) {
    if (isBlockActiveAt(block, minute)) {
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
  const n = ((Math.floor(m) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return n;
}

/** Convenience: build "minutes since midnight" from a Date in local time. */
export function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}
