import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Aggressively clear OS-level network caches so just-blocked sites stop
 * resolving from cached entries.
 *
 *   ipconfig /flushdns                   → DNS resolver cache (no admin)
 *   netsh interface ip delete arpcache   → ARP cache (admin)
 *   netsh interface ip delete dest…cache → routing destination cache (admin)
 *
 * The netsh commands need elevated rights. The Electron app, when we've
 * relaunched with admin, has them. The standalone Windows Service (which
 * runs as LocalSystem) also has them. When we don't have admin, the
 * non-elevated commands still run; the netsh failures are silently ignored
 * so we don't fail the whole flush over them.
 *
 * NOTE: this *cannot* clear browser-internal DNS or HTTP caches. Chrome/
 * Edge/Firefox each keep their own in-memory caches that only drop on
 * hard-refresh, navigation, or process restart. The UI tells the user
 * about this; we can't bust it from outside.
 */
export async function flushDns(): Promise<{ ok: boolean; error?: string }> {
  if (process.platform !== 'win32') return { ok: true };

  const commands: { cmd: string; args: string[]; required: boolean }[] = [
    { cmd: 'ipconfig', args: ['/flushdns'], required: true },
    { cmd: 'netsh', args: ['interface', 'ip', 'delete', 'arpcache'], required: false },
    { cmd: 'netsh', args: ['interface', 'ip', 'delete', 'destinationcache'], required: false },
  ];

  let firstRequiredError: string | undefined;
  for (const { cmd, args, required } of commands) {
    try {
      await execFileAsync(cmd, args, { windowsHide: true, timeout: 10_000 });
    } catch (err: any) {
      const message = err?.message ?? String(err);
      if (required && !firstRequiredError) firstRequiredError = message;
      // Best-effort: keep going so we don't abort the OS flush over a
      // missing admin token on a sub-command.
    }
  }

  return firstRequiredError ? { ok: false, error: firstRequiredError } : { ok: true };
}
