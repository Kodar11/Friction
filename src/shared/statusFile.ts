import type { ScheduleEvaluation } from './types.js';

/**
 * Wire format for the on-disk service heartbeat. The service writes this
 * after every reconciliation (or at least every tick); the Electron app
 * reads it to render live status.
 *
 * The heartbeat is what tells the app "the service is up and reconciling".
 * Stale-by-timestamp means the service is dead.
 */
export interface ServiceHeartbeat {
  version: 1;
  /** Wall-clock ms when this heartbeat was written. */
  writtenAt: number;
  /** Process id of the service. */
  pid: number;
  /** Last successful evaluation, or null if no config is loaded. */
  evaluation: ScheduleEvaluation | null;
  /** Last error the service surfaced (cleared on next successful tick). */
  lastError: string | null;
}
