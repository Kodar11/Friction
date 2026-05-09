import { evaluate, minuteOfDay } from '../shared/scheduleEngine.js';
import type { BlockerConfig, DeactivationEntry, HardModeLevel } from '../shared/types.js';

/**
 * Hard Mode state machine — coordinator only. The renderer is responsible
 * for rendering the friction UI; main process tells it which flow to run
 * and writes the deactivation log entry once the user completes (or cancels).
 *
 * Levels and their flows:
 *   off      → 'allowed'        (no friction; renderer immediately calls completeDeactivate)
 *   light    → 'needs-confirm'  (renderer shows ConfirmDialog)
 *   medium   → 'needs-phrase'   (renderer shows TypePhraseDialog with REQUIRED_PHRASE)
 *   hard     → 'needs-countdown'(renderer shows 5-minute countdown + reason text area)
 *   extreme  → during a scheduled block window: 'blocked'
 *              outside any window:                'needs-countdown' (same as hard)
 *
 * The 'blocked' result short-circuits — there's no completeDeactivate
 * follow-up, just a toast in the UI.
 */

export type DeactivateRequestResult =
  | 'allowed'
  | 'needs-confirm'
  | 'needs-phrase'
  | 'needs-countdown'
  | 'blocked';

export const REQUIRED_PHRASE = 'DEACTIVATE FOCUS BLOCKER';
export const HARD_COUNTDOWN_MS = 5 * 60_000;

export interface DeactivateRequest {
  result: DeactivateRequestResult;
  level: HardModeLevel;
  countdownMs?: number;
  requiredPhrase?: string;
}

/** Pure: given the current config + the current moment, decide the flow.
 *  Used directly by IPC handlers and by tests. */
export function classifyDeactivateRequest(
  config: BlockerConfig,
  now: Date = new Date(),
): DeactivateRequest {
  const level = config.hardMode.level;

  switch (level) {
    case 'off':
      return { result: 'allowed', level };
    case 'light':
      return { result: 'needs-confirm', level };
    case 'medium':
      return { result: 'needs-phrase', level, requiredPhrase: REQUIRED_PHRASE };
    case 'hard':
      return { result: 'needs-countdown', level, countdownMs: HARD_COUNTDOWN_MS };
    case 'extreme': {
      const ev = evaluate(config, minuteOfDay(now), now.getDay());
      if (ev.activeGroups.length > 0) {
        return { result: 'blocked', level };
      }
      return { result: 'needs-countdown', level, countdownMs: HARD_COUNTDOWN_MS };
    }
  }
}

/** Build a "successful deactivation" log entry. */
export function buildDeactivationEntry(
  level: HardModeLevel,
  reason: string | null,
  now: number = Date.now(),
): DeactivationEntry {
  return {
    timestamp: now,
    hardModeLevel: level,
    // For light/off, reason is always null. For medium it's null too — the
    // phrase itself is the friction. For hard/extreme it's whatever the
    // user typed in.
    reason: level === 'hard' || level === 'extreme' ? (reason ?? '') : null,
    reactivatedAt: null,
  };
}

/** Build a "cancelled deactivation" log entry — surfaces in stats so the
 *  user can see attempts they reconsidered. */
export function buildCancelledEntry(
  level: HardModeLevel,
  reason: string | null,
  now: number = Date.now(),
): DeactivationEntry {
  return {
    timestamp: now,
    hardModeLevel: level,
    reason: level === 'hard' || level === 'extreme' ? (reason ?? '') : null,
    reactivatedAt: null,
    cancelled: true,
  };
}

/** Append entry, capping the log at the configured maximum (FIFO). */
export const DEACTIVATION_LOG_CAP = 1000;

export function appendDeactivation(
  log: DeactivationEntry[],
  entry: DeactivationEntry,
): DeactivationEntry[] {
  // Newest first (matches plan: "Newest first. Capped at 1000 entries, oldest dropped.")
  const next = [entry, ...log];
  if (next.length > DEACTIVATION_LOG_CAP) next.length = DEACTIVATION_LOG_CAP;
  return next;
}

/** When the user re-activates blocking, close the most recent open
 *  (non-cancelled, no reactivatedAt) deactivation entry by stamping
 *  reactivatedAt. Returns a new log array; never mutates the input. */
export function closeOpenDeactivation(
  log: DeactivationEntry[],
  now: number = Date.now(),
): DeactivationEntry[] {
  const idx = log.findIndex((e) => !e.cancelled && e.reactivatedAt === null);
  if (idx < 0) return log;
  const next = [...log];
  next[idx] = { ...next[idx], reactivatedAt: now };
  return next;
}
