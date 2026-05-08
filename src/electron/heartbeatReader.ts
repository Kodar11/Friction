import fsp from 'node:fs/promises';
import path from 'node:path';
import { HEARTBEAT_FRESHNESS_MS, STATUS_FILENAME } from '../shared/constants.js';
import type { ServiceHeartbeat } from '../shared/statusFile.js';

export interface HeartbeatSnapshot {
  /** Service is alive iff a fresh heartbeat exists. */
  alive: boolean;
  /** ms since last heartbeat write, or null if no file. */
  ageMs: number | null;
  data: ServiceHeartbeat | null;
}

export class HeartbeatReader {
  private readonly file: string;
  constructor(dir: string) {
    this.file = path.join(dir, STATUS_FILENAME);
  }

  async read(): Promise<HeartbeatSnapshot> {
    try {
      const raw = await fsp.readFile(this.file, 'utf8');
      const data = JSON.parse(raw) as ServiceHeartbeat;
      const age = Date.now() - data.writtenAt;
      return {
        alive: age >= 0 && age <= HEARTBEAT_FRESHNESS_MS,
        ageMs: age,
        data,
      };
    } catch {
      return { alive: false, ageMs: null, data: null };
    }
  }
}
