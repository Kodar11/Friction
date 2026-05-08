import { HOSTS_BEGIN, HOSTS_END, REDIRECT_IP } from '../../shared/constants.js';

/**
 * Hosts-file marker management. We only ever read/write entries between our
 * BEGIN and END marker lines. Anything outside is preserved byte-for-byte
 * (decision #5).
 */

export interface RenderArgs {
  /** Absolute hostnames (already variant-expanded). */
  hosts: string[];
  /** ISO timestamp written into the comment header. */
  now: string;
  /** Group names currently driving the block, e.g. ["Social", "Work"]. */
  activeGroupNames: string[];
}

/** Render the managed region (including BEGIN/END lines) as a string ending in '\n'. */
export function renderManagedRegion({ hosts, now, activeGroupNames }: RenderArgs): string {
  const summary = activeGroupNames.length > 0 ? activeGroupNames.join(', ') : '(none)';
  const lines: string[] = [
    HOSTS_BEGIN,
    `# Managed by Focus Blocker. Last updated: ${now}`,
    `# Currently blocking: ${summary}`,
  ];
  for (const h of hosts) {
    lines.push(`${REDIRECT_IP} ${h}`);
  }
  lines.push(HOSTS_END);
  return lines.join('\n') + '\n';
}

/**
 * Splice our managed region into an existing hosts file.
 *
 * Behaviour:
 *   - If markers exist exactly once, replace the region between them.
 *   - If the new region is empty (no hosts), remove the markers entirely so
 *     we don't litter the file with stale comments when blocking is off.
 *   - If markers are missing, append the new region with a leading blank line.
 *   - Preserves the trailing newline state of the original file.
 *   - Idempotent: feeding the same hosts twice produces the same output
 *     (modulo timestamp).
 */
export function spliceManaged(
  existing: string,
  newRegion: string | null,
): string {
  const eol = detectEol(existing);
  const lines = existing.split(/\r\n|\r|\n/);
  // split with a regex like that drops the separator; but if the original
  // ended with EOL the last entry is "". We'll rejoin with `eol` and add a
  // trailing EOL only if the original had one.
  const endedWithEol = /(\r\n|\r|\n)$/.test(existing);

  const beginIdx = lines.findIndex((l) => l.trimEnd() === HOSTS_BEGIN);
  const endIdx = lines.findIndex((l) => l.trimEnd() === HOSTS_END);

  const wantRemove = newRegion === null;

  if (beginIdx >= 0 && endIdx > beginIdx) {
    // Replace existing region.
    const before = lines.slice(0, beginIdx);
    const after = lines.slice(endIdx + 1);
    let merged: string[];
    if (wantRemove) {
      merged = stripBlankBoundary(before, after);
    } else {
      const regionLines = newRegion!.replace(/\n$/, '').split('\n');
      merged = [...before, ...regionLines, ...after];
    }
    return joinPreservingTrailing(merged, eol, endedWithEol);
  }

  if (beginIdx >= 0 || endIdx >= 0) {
    // Markers exist but aren't paired correctly. Refuse to mutate; caller can
    // either restore or surface to the user.
    throw new Error('Hosts file has unpaired focus-blocker markers; refusing to write.');
  }

  if (wantRemove) {
    // No markers, nothing to remove.
    return existing;
  }

  // No markers: append our region with a separating blank line.
  const trimmed = lines.length && lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
  const regionLines = newRegion!.replace(/\n$/, '').split('\n');
  const needsBlankBefore = trimmed.length > 0 && trimmed[trimmed.length - 1] !== '';
  const merged = [
    ...trimmed,
    ...(needsBlankBefore ? [''] : []),
    ...regionLines,
  ];
  return joinPreservingTrailing(merged, eol, true);
}

/** True if the file currently has our managed region. */
export function hasManagedRegion(existing: string): boolean {
  return existing.includes(HOSTS_BEGIN) && existing.includes(HOSTS_END);
}

function joinPreservingTrailing(lines: string[], eol: string, trailing: boolean): string {
  // `split` on EOL leaves a trailing '' when the original ended with EOL.
  // Drop a single trailing '' so we don't double-add the line terminator below.
  const body = lines.length > 0 && lines[lines.length - 1] === ''
    ? lines.slice(0, -1).join(eol)
    : lines.join(eol);
  return trailing ? body + eol : body;
}

function stripBlankBoundary(before: string[], after: string[]): string[] {
  // When removing our region, collapse adjacent blank lines we may have
  // introduced earlier so the file doesn't grow vertical whitespace each
  // install/uninstall cycle.
  const left = [...before];
  while (left.length > 0 && left[left.length - 1] === '') left.pop();
  const right = [...after];
  while (right.length > 0 && right[0] === '') right.shift();
  if (left.length === 0) return right;
  if (right.length === 0) return left;
  return [...left, '', ...right];
}

function detectEol(s: string): string {
  if (s.includes('\r\n')) return '\r\n';
  if (s.includes('\r')) return '\r';
  return '\n';
}
