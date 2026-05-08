import type { ScheduleEvaluation } from './types.js';

/**
 * Wire format for the on-disk runtime heartbeat. Whichever process is
 * currently reconciling the hosts file — the standalone Windows Service or
 * the Electron app's in-process runtime — writes this after every tick. The
 * Electron renderer reads it to render live status.
 *
 * Stale-by-timestamp means the runtime that wrote it has died.
 */
export interface ServiceHeartbeat {
  version: 1;
  /** Wall-clock ms when this heartbeat was written. */
  writtenAt: number;
  /** Process id of whoever wrote this heartbeat. */
  pid: number;
  /** Last successful evaluation, or null if no config is loaded. */
  evaluation: ScheduleEvaluation | null;
  /** Last error the runtime surfaced (cleared on next successful tick). */
  lastError: string | null;
  /** Categorised error kind, when the last error has a known structured cause. */
  errorKind?: 'permission' | 'other' | null;
  /** Wall-clock ms of the last successful DNS flush, or null if never. */
  lastFlushedAt?: number | null;
}
