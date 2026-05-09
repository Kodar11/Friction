import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ActivityLogger, shouldLogChange } from '../../src/service/activityLogger.js';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-act-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('ActivityLogger', () => {
  it('append + read round-trip', async () => {
    const log = new ActivityLogger({ dir });
    await log.append({ ts: 1000, active: true, blocking: ['Social'] });
    await log.append({ ts: 2000, active: true, blocking: [] });
    const entries = await log.read();
    expect(entries).toEqual([
      { ts: 1000, active: true, blocking: ['Social'] },
      { ts: 2000, active: true, blocking: [] },
    ]);
  });

  it('returns [] when file does not exist', async () => {
    const log = new ActivityLogger({ dir });
    expect(await log.read()).toEqual([]);
  });

  it('skips malformed lines', async () => {
    const log = new ActivityLogger({ dir });
    await log.append({ ts: 1000, active: true, blocking: ['Social'] });
    await fs.appendFile(log.filePath(), 'not-json\n');
    await log.append({ ts: 2000, active: false, blocking: [] });
    const entries = await log.read();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.ts)).toEqual([1000, 2000]);
  });

  it('prune drops entries older than maxAgeDays', async () => {
    const log = new ActivityLogger({ dir, maxAgeDays: 7 });
    const now = Date.now();
    const oldTs = now - 10 * 24 * 60 * 60 * 1000;
    const recentTs = now - 1 * 24 * 60 * 60 * 1000;
    await log.append({ ts: oldTs, active: true, blocking: ['x'] });
    await log.append({ ts: recentTs, active: true, blocking: ['x'] });

    const dropped = await log.prune(now);
    expect(dropped).toBe(1);
    const entries = await log.read();
    expect(entries).toHaveLength(1);
    expect(entries[0].ts).toBe(recentTs);
  });

  it('prune is idempotent + safe on empty log', async () => {
    const log = new ActivityLogger({ dir });
    expect(await log.prune()).toBe(0);
  });
});

describe('shouldLogChange', () => {
  it('returns true when prev is null', () => {
    expect(shouldLogChange(null, { active: false, blocking: [] })).toBe(true);
  });

  it('detects active flip', () => {
    expect(
      shouldLogChange({ active: false, blocking: [] }, { active: true, blocking: [] }),
    ).toBe(true);
  });

  it('detects blocking-set change', () => {
    expect(
      shouldLogChange({ active: true, blocking: ['Social'] }, { active: true, blocking: [] }),
    ).toBe(true);
  });

  it('returns false when nothing changed (order-independent)', () => {
    expect(
      shouldLogChange(
        { active: true, blocking: ['Social', 'Work'] },
        { active: true, blocking: ['Work', 'Social'] },
      ),
    ).toBe(false);
  });
});
