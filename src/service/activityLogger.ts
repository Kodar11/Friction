import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ACTIVITY_FILENAME } from '../shared/constants.js';
import type { ActivityEntry } from '../shared/types.js';

/**
 * Append-only line-delimited JSON ("JSONL") writer for the runtime's
 * blocking-state changes. The stats engine reads this back to compute
 * streaks, time saved, adherence, and the heatmap.
 *
 * Contract:
 *   - One entry per *state change* (active or blocking-set transition).
 *   - Caller decides what counts as "change"; this class doesn't dedupe.
 *   - Writes are queued so concurrent appends serialise (no interleaved lines).
 *   - Pruning drops entries older than `maxAgeDays` from the head, atomically
 *     replacing the file. Cheap because the file is bounded (<= 90 days).
 */

export interface ActivityLoggerOpts {
  dir: string;
  /** Default 90 days, matching the heatmap window. */
  maxAgeDays?: number;
}

export class ActivityLogger {
  private readonly file: string;
  private readonly maxAgeDays: number;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(opts: ActivityLoggerOpts) {
    fs.mkdirSync(opts.dir, { recursive: true });
    this.file = path.join(opts.dir, ACTIVITY_FILENAME);
    this.maxAgeDays = opts.maxAgeDays ?? 90;
  }

  filePath(): string { return this.file; }

  /** Queue an append. Resolves after the line is on disk (or silently swallowed). */
  append(entry: ActivityEntry): Promise<void> {
    const line = JSON.stringify(entry) + '\n';
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        await fsp.appendFile(this.file, line, 'utf8');
      } catch {
        // Activity log is best-effort; failing here must not crash the runtime.
      }
    });
    return this.writeQueue;
  }

  /** Read all entries, oldest first. Skips malformed lines. */
  async read(): Promise<ActivityEntry[]> {
    let raw: string;
    try {
      raw = await fsp.readFile(this.file, 'utf8');
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
    const out: ActivityEntry[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as ActivityEntry;
        if (
          typeof parsed.ts === 'number' &&
          typeof parsed.active === 'boolean' &&
          Array.isArray(parsed.blocking)
        ) {
          out.push(parsed);
        }
      } catch {
        // skip
      }
    }
    return out;
  }

  /** Drop entries older than `maxAgeDays` from the head. Returns # dropped. */
  async prune(now: number = Date.now()): Promise<number> {
    const cutoff = now - this.maxAgeDays * 24 * 60 * 60 * 1000;
    const entries = await this.read();
    if (entries.length === 0) return 0;

    const kept = entries.filter((e) => e.ts >= cutoff);
    const dropped = entries.length - kept.length;
    if (dropped === 0) return 0;

    const body = kept.map((e) => JSON.stringify(e)).join('\n') + (kept.length ? '\n' : '');
    const tmp = this.file + '.tmp';
    await fsp.writeFile(tmp, body, 'utf8');
    await fsp.rename(tmp, this.file);
    return dropped;
  }
}

/**
 * Helper for the runtime: only append a new entry when the state has actually
 * changed since the previous one. Mutates `last` in place via the returned
 * value the caller stores.
 */
export function shouldLogChange(
  prev: { active: boolean; blocking: string[] } | null,
  next: { active: boolean; blocking: string[] },
): boolean {
  if (!prev) return true;
  if (prev.active !== next.active) return true;
  if (prev.blocking.length !== next.blocking.length) return true;
  const prevSorted = [...prev.blocking].sort();
  const nextSorted = [...next.blocking].sort();
  for (let i = 0; i < prevSorted.length; i++) {
    if (prevSorted[i] !== nextSorted[i]) return true;
  }
  return false;
}
