import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Flush the OS DNS cache so that just-blocked sites stop resolving from the
 * cached entries the browser/OS may already have.
 *
 * On Windows this runs `ipconfig /flushdns`. The service runs as SYSTEM, which
 * is allowed to do this. We never throw — DNS flush is best-effort; failing
 * here should not crash the scheduler tick.
 */
export async function flushDns(): Promise<{ ok: boolean; error?: string }> {
  if (process.platform !== 'win32') {
    return { ok: true };
  }
  try {
    await execFileAsync('ipconfig', ['/flushdns'], { windowsHide: true, timeout: 10_000 });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}
