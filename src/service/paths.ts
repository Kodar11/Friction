import path from 'node:path';

/** Hosts-file location per platform. v1 only ships Windows but we keep this
 *  function here so the v1.1 macOS/Linux work is a one-line addition. */
export function getHostsFilePath(): string {
  if (process.platform === 'win32') {
    return path.join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32',
      'drivers',
      'etc',
      'hosts',
    );
  }
  return '/etc/hosts';
}
