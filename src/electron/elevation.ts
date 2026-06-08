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
  const dir = 'dist-electron/service';

  const candidates = [
    path.join(appPath, dir, filename),
    isDev() ? path.join(process.cwd(), dir, filename) : null,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
    const alt = candidate.replace(/\.cjs$/, '.js');
    if (alt !== candidate && fs.existsSync(alt)) return alt;
  }

  return null;
}

/**
 * Install the FrictionService via UAC elevation.
 *
 * Approach: use PowerShell `Start-Process -Verb RunAs` to launch an elevated
 * PowerShell child, then set ELECTRON_RUN_AS_NODE inside that elevated child
 * before invoking our compiled install.cjs. Setting the env var in the parent
 * process is not reliable across UAC.
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

  const logPath = path.join(app.getPath('userData'), 'service-install.log');
  return runElevated(process.execPath, [
    installScript,
    '--user-data',
    app.getPath('userData'),
    '--exec-path',
    process.execPath,
    '--log-file',
    logPath,
  ], logPath);
}

export async function uninstallServiceElevated(): Promise<ElevationResult> {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'The background service is Windows-only.' };
  }
  const uninstallScript = resolveServiceScript('uninstall.cjs');
  if (!uninstallScript) {
    return { ok: false, error: 'Uninstall script not found.' };
  }
  const logPath = path.join(app.getPath('userData'), 'service-uninstall.log');
  return runElevated(process.execPath, [
    uninstallScript,
    '--user-data',
    app.getPath('userData'),
    '--exec-path',
    process.execPath,
    '--log-file',
    logPath,
  ], logPath);
}

function runElevated(filePath: string, args: string[], logPath?: string): Promise<ElevationResult> {
  // PowerShell: -Verb RunAs triggers UAC. Run a second PowerShell elevated so
  // the Node-mode env var is set after elevation, where Electron will see it.
  const psStr = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const innerArgs = args.map(psStr).join(' ');
  const innerCommand =
    `$env:ELECTRON_RUN_AS_NODE = '1'; ` +
    `& ${psStr(filePath)} ${innerArgs}; ` +
    `exit $LASTEXITCODE`;
  const argList = [
    psStr('-NoProfile'),
    psStr('-ExecutionPolicy'),
    psStr('Bypass'),
    psStr('-Command'),
    psStr(innerCommand),
  ].join(',');
  const command =
    `$p = Start-Process -FilePath 'powershell.exe' -ArgumentList @(${argList}) ` +
    `-Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode`;

  if (logPath) {
    try {
      fs.rmSync(logPath, { force: true });
    } catch {
      // best effort; a stale log should not prevent the UAC prompt
    }
  }

  console.log(`[UI] Elevating: ${filePath}`);

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { windowsHide: true, timeout: 5 * 60 * 1000 },
      (err, _stdout, stderr) => {
        const log = readFailureLog(logPath);
        if (!err) {
          if (log && /\[error\]/i.test(log)) {
            resolve({ ok: false, error: log });
            return;
          }
          resolve({ ok: true });
          return;
        }
        // PowerShell exits non-zero when the user cancels UAC; surface a
        // friendlier message in that case.
        const msg = (stderr || err.message || '').toString();
        if (/cancell?ed/i.test(msg) || /operation was cancelled/i.test(msg)) {
          resolve({ ok: false, error: 'Elevation was cancelled.' });
        } else {
          resolve({ ok: false, error: [msg.trim(), log].filter(Boolean).join('\n\n') || 'Failed to elevate.' });
        }
      },
    );
  });
}

function readFailureLog(logPath?: string): string | null {
  if (!logPath || !fs.existsSync(logPath)) return null;
  try {
    const raw = fs.readFileSync(logPath, 'utf8').trim();
    if (!raw) return null;
    return raw.split(/\r?\n/).slice(-30).join('\n');
  } catch {
    return null;
  }
}

/**
 * Probe whether the FrictionService is registered with the SCM.
 *
 * Uses the correct internal service ID "frictionservice.exe" (node-windows
 * generates this from the display name "FrictionService" via
 * name.replace(/[^\w]/gi, '').toLowerCase() + '.exe').
 */
export async function isServiceInstalled(): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  return new Promise((resolve) => {
    execFile(
      'sc',
      ['query', 'frictionservice.exe'],
      { windowsHide: true, timeout: 5_000, encoding: 'utf8' },
      (err, stdout) => {
        if (err) return resolve(false);
        // sc query may succeed for non-admin users too; confirm the service
        // name actually appears in the output to avoid false positives.
        resolve((stdout || '').includes('frictionservice'));
      },
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
