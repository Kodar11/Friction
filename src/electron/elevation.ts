import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import { isDev } from './util.js';

export interface ElevationResult {
  ok: boolean;
  /** User-friendly error to render in the UI. */
  error?: string;
}

/**
 * Resolve the path to a service script (install/uninstall).
 * Handles both dev mode (dist-electron) and production (app.asar unpacked).
 */
function resolveServiceScript(filename: string): string | null {
  const appPath = app.getAppPath();
  
  // In production, scripts are in the app.asar unpacked dist-electron folder
  const prodPath = path.join(appPath, 'dist-electron', 'service', filename);
  
  // In dev mode, dist-electron is at project root
  const devPath = isDev()
    ? path.join(process.cwd(), 'dist-electron', 'service', filename)
    : null;
  
  // Try .cjs first (production transpilation), then .js (dev transpilation)
  const extensions = ['.cjs', '.js'];
  
  for (const basePath of [prodPath, devPath].filter(Boolean)) {
    for (const ext of extensions) {
      const candidate = basePath!.replace(/\.(cts|cts)$/, ext).replace(/\.cjs$/, ext).replace(/\.js$/, ext);
      // Try with the exact filename first, then with replaced extension
      const fullPath = path.join(path.dirname(basePath!), path.basename(filename).replace(/\.(cts|cts)$/, ext));
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }
  
  // Fallback: try the original filename as-is
  if (fs.existsSync(prodPath)) return prodPath;
  if (devPath && fs.existsSync(devPath)) return devPath;
  
  return null;
}

/**
 * Install the FocusBlockerService via UAC elevation.
 *
 * Approach: use PowerShell `Start-Process -Verb RunAs` to launch `node.exe`
 * (from PATH) on our compiled install.cjs. Windows shows the UAC prompt; if
 * the user accepts, the elevated node process registers the service and
 * starts it. If they cancel, PowerShell exits non-zero.
 *
 * `-Wait` blocks until the elevated process exits so we know when to refresh
 * status in the UI.
 */
export async function installServiceElevated(): Promise<ElevationResult> {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'The background service is Windows-only.' };
  }

  const installScript = resolveServiceScript('install.cjs');
  if (!installScript) {
    return {
      ok: false,
      error: `Install script not found. Run \`npm run transpile:electron\` first.`,
    };
  }

  return runElevated('node', installScript);
}

export async function uninstallServiceElevated(): Promise<ElevationResult> {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'The background service is Windows-only.' };
  }
  const uninstallScript = resolveServiceScript('uninstall.cjs');
  if (!uninstallScript) {
    return { ok: false, error: 'Uninstall script not found.' };
  }
  return runElevated('node', uninstallScript);
}

function runElevated(filePath: string, scriptPath: string): Promise<ElevationResult> {
  // PowerShell: -Verb RunAs triggers UAC. -Wait keeps us blocked until the
  // elevated child exits. Single-quoted PS strings to avoid escaping headaches.
  const psQuoted = scriptPath.replace(/'/g, "''");
  const command = `Start-Process -FilePath '${filePath}' -ArgumentList '"${psQuoted}"' -Verb RunAs -Wait -WindowStyle Hidden`;

  console.log(`[UI] Elevating: ${scriptPath}`);

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { windowsHide: true, timeout: 5 * 60 * 1000 },
      (err, _stdout, stderr) => {
        if (!err) {
          resolve({ ok: true });
          return;
        }
        // PowerShell exits non-zero when the user cancels UAC; surface a
        // friendlier message in that case.
        const msg = (stderr || err.message || '').toString();
        if (/cancell?ed/i.test(msg) || /operation was cancelled/i.test(msg)) {
          resolve({ ok: false, error: 'Elevation was cancelled.' });
        } else {
          resolve({ ok: false, error: msg.trim() || 'Failed to elevate.' });
        }
      },
    );
  });
}

/**
 * Probe whether the FocusBlockerService is registered with the SCM. Returns
 * `false` even when the user is not admin — `sc query <name>` only fails for
 * unprivileged users on a non-existent service. For "is it running",
 * we rely on the heartbeat freshness instead.
 */
export async function isServiceInstalled(): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  return new Promise((resolve) => {
    execFile(
      'sc',
      ['query', 'FocusBlockerService'],
      { windowsHide: true, timeout: 5_000 },
      (err) => resolve(!err),
    );
  });
}

/**
 * Whether the current process holds local-admin rights. Uses the canonical
 * `net session` trick on Windows — non-admin sessions get an "access is
 * denied" exit code. Returns false on non-Windows where the question doesn't
 * meaningfully apply (we're Windows-only for v1 anyway).
 */
export async function isCurrentProcessAdmin(): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  return new Promise((resolve) => {
    execFile(
      'net',
      ['session'],
      { windowsHide: true, timeout: 5_000 },
      (err) => resolve(!err),
    );
  });
}

/**
 * Relaunch the current Electron process with admin privileges via UAC.
 *
 * Approach: PowerShell `Start-Process -Verb RunAs` on `process.execPath`
 * with the same argv/cwd. The OS shows one UAC prompt; on accept, a new
 * elevated instance starts. The caller is responsible for quitting the
 * unprivileged instance after we resolve `ok: true`.
 *
 * This mirrors what a regular admin script does: get admin once, write
 * `C:\Windows\System32\drivers\etc\hosts` directly. No service required.
 */
export async function relaunchAsAdmin(): Promise<ElevationResult> {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Windows only' };
  }

  const exe = process.execPath;
  const cwd = process.cwd();
  // process.argv[0] is the electron exe; argv[1+] are the actual app args
  // (e.g. "." in dev pointing at the project root).
  const args = process.argv.slice(1);

  // UAC may not forward env vars; carry the dev signal across as a flag.
  if (process.env.NODE_ENV === 'development' && !args.includes('--dev')) {
    args.push('--dev');
  }

  // Single-quote PowerShell string with '' escaping.
  const psStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

  let cmd = `Start-Process -FilePath ${psStr(exe)}`;
  if (args.length > 0) {
    cmd += ` -ArgumentList @(${args.map(psStr).join(',')})`;
  }
  cmd += ` -WorkingDirectory ${psStr(cwd)} -Verb RunAs`;

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', cmd],
      { windowsHide: true, timeout: 30_000 },
      (err, _stdout, stderr) => {
        if (!err) {
          resolve({ ok: true });
          return;
        }
        const msg = (stderr || err.message || '').toString();
        if (/cancell?ed/i.test(msg) || /operation was cancelled/i.test(msg)) {
          resolve({ ok: false, error: 'Administrator request was cancelled.' });
        } else {
          resolve({ ok: false, error: msg.trim() || 'Failed to elevate.' });
        }
      },
    );
  });
}
