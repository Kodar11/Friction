import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { getHostsFilePath } from '../paths.js';
import { renderManagedRegion, spliceManaged } from './markers.js';
import { expandAll } from './variants.js';

export interface ApplyArgs {
  /** Raw hostnames as the user entered them (we do variant expansion). */
  hosts: string[];
  activeGroupNames: string[];
  /** Override for tests. */
  hostsPath?: string;
}

/**
 * Apply (or remove) our managed region to/from the system hosts file.
 *
 * Strategy:
 *   1. Read current hosts.
 *   2. Compute desired bytes via spliceManaged.
 *   3. If unchanged, no-op (this keeps writes idempotent and avoids waking
 *      antivirus / file-watcher loops).
 *   4. Otherwise, write atomically: temp file in same dir + rename.
 *
 * Returns true if the file was modified, false if no change.
 */
export async function applyHosts(args: ApplyArgs): Promise<boolean> {
  const target = args.hostsPath ?? getHostsFilePath();
  const expanded = expandAll(args.hosts);
  const region =
    expanded.length === 0
      ? null
      : renderManagedRegion({
          hosts: expanded,
          now: new Date().toISOString(),
          activeGroupNames: args.activeGroupNames,
        });

  const existing = await readOrEmpty(target);
  const next = spliceManaged(existing, region);

  if (next === existing) return false;
  await atomicWrite(target, next);
  return true;
}

/** Remove our managed region entirely (used by the Restore button + uninstall). */
export async function removeManagedRegion(hostsPath?: string): Promise<boolean> {
  const target = hostsPath ?? getHostsFilePath();
  const existing = await readOrEmpty(target);
  const next = spliceManaged(existing, null);
  if (next === existing) return false;
  await atomicWrite(target, next);
  return true;
}

async function readOrEmpty(target: string): Promise<string> {
  try {
    return await fs.readFile(target, 'utf8');
  } catch (err: any) {
    if (err.code === 'ENOENT') return '';
    throw err;
  }
}

/**
 * Write atomically: temp file in same dir, then rename. On Windows the rename
 * is atomic only when source and destination are on the same volume, hence
 * "same directory".
 */
async function atomicWrite(target: string, contents: string): Promise<void> {
  const dir = path.dirname(target);
  const tmp = path.join(dir, `.focus-blocker.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, contents, { encoding: 'utf8' });
  try {
    await fs.rename(tmp, target);
  } catch (err) {
    // best-effort cleanup
    try {
      await fs.unlink(tmp);
    } catch {}
    throw err;
  }
}

// Avoid an unused-import lint when this file is consumed by tests.
void os;
