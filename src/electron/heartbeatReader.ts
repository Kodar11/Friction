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
  /** Config sequence the service last saw. Compare with config.configSequence to verify sync. */
  configSequence: number | null;
  /** Uptime in ms, derived from startedAt timestamp. */
  uptimeMs: number | null;
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
      const uptime = data.startedAt ? Date.now() - data.startedAt : null;
      return {
        alive: age >= 0 && age <= HEARTBEAT_FRESHNESS_MS,
        ageMs: age,
        data,
        configSequence: data.configReloadCount ?? null,
        uptimeMs: uptime,
      };
    } catch {
      return { alive: false, ageMs: null, data: null, configSequence: null, uptimeMs: null };
    }
  }
}
