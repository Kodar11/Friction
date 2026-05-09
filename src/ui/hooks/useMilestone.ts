import { useEffect, useState } from 'react';

export const MILESTONES = [7, 30, 100] as const;
export type Milestone = (typeof MILESTONES)[number];

const STORAGE_KEY = 'fb.celebrated.milestones';

function loadCelebrated(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((n): n is number => typeof n === 'number'));
  } catch {
    return new Set();
  }
}

function saveCelebrated(set: Set<number>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set].sort((a, b) => a - b)));
  } catch {
    // localStorage might be unavailable or quota'd — silently degrade.
  }
}

/**
 * Detects the moment a streak crosses a milestone (7 / 30 / 100) for the
 * first time and returns it once. Acknowledging via `acknowledge()` clears
 * the pending celebration. Crossings are persisted in localStorage so a
 * single milestone is celebrated exactly once per machine.
 *
 * Test hook: `__resetForTests()` wipes the local set + storage.
 */
export function useMilestone(currentStreak: number | null | undefined): {
  pending: Milestone | null;
  acknowledge: () => void;
} {
  const [pending, setPending] = useState<Milestone | null>(null);

  useEffect(() => {
    if (typeof currentStreak !== 'number') return;
    const celebrated = loadCelebrated();
    // Find the highest milestone the streak has reached that we haven't
    // already celebrated. (Catches the case where someone runs the app for
    // the first time after already passing 7 or 30 — show the latest one.)
    let toCelebrate: Milestone | null = null;
    for (const m of MILESTONES) {
      if (currentStreak >= m && !celebrated.has(m)) {
        toCelebrate = m;
      }
    }
    if (toCelebrate !== null) setPending(toCelebrate);
  }, [currentStreak]);

  const acknowledge = () => {
    if (pending === null) return;
    const celebrated = loadCelebrated();
    celebrated.add(pending);
    saveCelebrated(celebrated);
    setPending(null);
  };

  return { pending, acknowledge };
}

export function __resetMilestonesForTests() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}
