import fsp from 'node:fs/promises';
import path from 'node:path';
import { STATUS_FILENAME } from '../shared/constants.js';
import type { ServiceHeartbeat } from '../shared/statusFile.js';
import type { ScheduleEvaluation } from '../shared/types.js';

export class HeartbeatWriter {
  private readonly file: string;
  private writeQueue: Promise<void> = Promise.resolve();
  private lastError: string | null = null;
  private errorKind: 'permission' | 'other' | null = null;
  private lastFlushedAt: number | null = null;

  constructor(dir: string) {
    this.file = path.join(dir, STATUS_FILENAME);
  }

  setLastError(message: string | null, kind: 'permission' | 'other' | null = null) {
    this.lastError = message;
    this.errorKind = message ? kind : null;
  }

  markFlushed(at: number = Date.now()) {
    this.lastFlushedAt = at;
  }

  /** Append-only write of the latest heartbeat. Errors here are swallowed. */
  write(evaluation: ScheduleEvaluation | null): void {
    const payload: ServiceHeartbeat = {
      version: 1,
      writtenAt: Date.now(),
      pid: process.pid,
      evaluation,
      lastError: this.lastError,
      errorKind: this.errorKind,
      lastFlushedAt: this.lastFlushedAt,
    };
    const tmp = this.file + '.tmp';
    const body = JSON.stringify(payload);
    this.writeQueue = this.writeQueue
      .then(async () => {
        try {
          await fsp.writeFile(tmp, body, 'utf8');
          await fsp.rename(tmp, this.file);
        } catch {
          // Heartbeat must never crash the runtime.
        }
      });
  }
}
