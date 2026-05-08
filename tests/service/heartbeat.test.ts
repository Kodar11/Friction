import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { HeartbeatWriter } from '../../src/service/heartbeat.js';
import { HeartbeatReader } from '../../src/electron/heartbeatReader.js';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-hb-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('Heartbeat round trip', () => {
  it('writer + reader agree on a fresh heartbeat', async () => {
    const w = new HeartbeatWriter(dir);
    w.write({ sites: ['youtube.com'], activeGroups: [{ groupId: 'g', groupName: 'Social' }], nextChangeAtMinute: null });
    // Wait for the queued write to flush.
    await new Promise((r) => setTimeout(r, 30));

    const r = new HeartbeatReader(dir);
    const snap = await r.read();
    expect(snap.alive).toBe(true);
    expect(snap.data?.evaluation?.sites).toEqual(['youtube.com']);
    expect(snap.data?.lastError).toBeNull();
  });

  it('reader reports alive=false when no heartbeat exists', async () => {
    const r = new HeartbeatReader(dir);
    const snap = await r.read();
    expect(snap.alive).toBe(false);
    expect(snap.data).toBeNull();
  });

  it('reader propagates lastError', async () => {
    const w = new HeartbeatWriter(dir);
    w.setLastError('boom');
    w.write(null);
    await new Promise((r) => setTimeout(r, 30));

    const r = new HeartbeatReader(dir);
    const snap = await r.read();
    expect(snap.data?.lastError).toBe('boom');
  });
});
