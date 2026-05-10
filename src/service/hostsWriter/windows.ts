import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { getHostsFilePath } from '../paths.js';
import { HOSTS_BEGIN, HOSTS_END, REDIRECT_IP } from '../../shared/constants.js';
import { hasManagedRegion, renderManagedRegion, spliceManaged } from './markers.js';
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

/** True when the on-disk managed region already matches the desired hosts. */
export async function managedHostsMatch(args: ApplyArgs): Promise<boolean> {
  const target = args.hostsPath ?? getHostsFilePath();
  const existing = await readOrEmpty(target);
  const desired = expandAll(args.hosts);

  if (desired.length === 0) return !hasManagedRegion(existing);
  const actual = extractManagedHosts(existing);
  if (!actual) return false;
  if (actual.length !== desired.length) return false;

  for (let i = 0; i < desired.length; i += 1) {
    if (actual[i] !== desired[i]) return false;
  }
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
    if (isPermissionError(err)) {
      try {
        // Some Windows security products and system-file semantics reject
        // rename-over-target for hosts even when the process can overwrite
        // the file contents. Keep the temp-file render, but fall back to a
        // direct copy before surfacing a permission error.
        await fs.copyFile(tmp, target);
        await fs.unlink(tmp);
        return;
      } catch (copyErr: any) {
        try { await fs.unlink(tmp); } catch {}
        if (isPermissionError(copyErr)) throw new HostsPermissionError(target, copyErr);
        throw copyErr;
      }
    }
    try { await fs.unlink(tmp); } catch {}
    throw err;
  }
}

function extractManagedHosts(existing: string): string[] | null {
  const lines = existing.split(/\r\n|\r|\n/);
  const beginIdx = lines.findIndex((l) => l.trimEnd() === HOSTS_BEGIN);
  const endIdx = lines.findIndex((l) => l.trimEnd() === HOSTS_END);
  if (beginIdx < 0 || endIdx <= beginIdx) return null;

  const hosts: string[] = [];
  for (const line of lines.slice(beginIdx + 1, endIdx)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts[0] === REDIRECT_IP && parts[1]) hosts.push(parts[1].toLowerCase());
  }
  return hosts.sort();
}

void os;
