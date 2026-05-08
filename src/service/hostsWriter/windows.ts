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
 * Thrown when reading/writing the hosts file fails because the current
 * process lacks the privileges to do so. Caller logic uses this to render an
 * actionable message instead of the raw EPERM/EACCES path.
 */
export class HostsPermissionError extends Error {
  readonly cause: NodeJS.ErrnoException;
  readonly target: string;
  constructor(target: string, cause: NodeJS.ErrnoException) {
    super(
      `Permission denied editing the hosts file (${target}). ` +
        `Run the app as administrator, or install the background service.`,
    );
    this.name = 'HostsPermissionError';
    this.target = target;
    this.cause = cause;
  }
}

function isPermissionError(err: unknown): err is NodeJS.ErrnoException {
  if (!err || typeof err !== 'object') return false;
  const code = (err as NodeJS.ErrnoException).code;
  return code === 'EPERM' || code === 'EACCES';
}

/**
 * Apply (or remove) our managed region to/from the system hosts file.
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
    if (isPermissionError(err)) throw new HostsPermissionError(target, err);
    throw err;
  }
}

/**
 * Atomic write: temp file in same dir, then rename. On Windows the rename is
 * atomic only when source and destination are on the same volume, hence
 * "same directory". Maps EPERM/EACCES to HostsPermissionError so the UI can
 * render a useful CTA instead of a path-shaped error.
 */
async function atomicWrite(target: string, contents: string): Promise<void> {
  const dir = path.dirname(target);
  const tmp = path.join(dir, `.focus-blocker.${process.pid}.${Date.now()}.tmp`);
  try {
    await fs.writeFile(tmp, contents, { encoding: 'utf8' });
  } catch (err: any) {
    if (isPermissionError(err)) throw new HostsPermissionError(target, err);
    throw err;
  }
  try {
    await fs.rename(tmp, target);
  } catch (err: any) {
    try { await fs.unlink(tmp); } catch {}
    if (isPermissionError(err)) throw new HostsPermissionError(target, err);
    throw err;
  }
}

void os;
