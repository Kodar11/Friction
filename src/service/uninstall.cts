/* eslint-disable @typescript-eslint/no-var-requires */
// Uninstalls FrictionService and clears the managed hosts-file region.
// Must be run as Administrator.
//
// Uses sc.exe directly with the correct internal service ID
// ("frictionservice.exe") instead of relying on the node-windows daemon
// wrapper, which may not be on disk at the expected path.

const path = require('path');
const fs = require('fs');
const cp = require('child_process');

if (process.platform !== 'win32') {
  console.error('[SERVICE] This uninstaller only supports Windows.');
  process.exit(1);
}

// node-windows generates the SCM internal name as: name.replace(/[^\w]/gi, '').toLowerCase()
// "FrictionService" → "frictionservice". The winsw <id> is id + '.exe' = "frictionservice.exe".
const SERVICE_ID = 'frictionservice.exe';

const args = parseArgs(process.argv.slice(2));
setupLog(args.logFile);

const repoRoot = path.resolve(__dirname, '..', '..');
const cleanupPath = path.join(repoRoot, 'dist-electron', 'service', 'cleanup.js');

if (serviceExists()) {
  forceStopService();
  deleteService();

  // Poll until SCM confirms the service is gone (up to 15s).
  const removed = pollServiceGoneSync(15_000);
  if (!removed) {
    console.warn('Timed out waiting for SCM to remove the service. Proceeding with cleanup anyway.');
  }
} else {
  console.log('Service not found in SCM — nothing to remove.');
}

runCleanup();
console.log('FrictionService is uninstalled.');
process.exit(0);

// ---------- Helpers ----------

function serviceExists(): boolean {
  const r = cp.spawnSync('sc.exe', ['query', SERVICE_ID], { windowsHide: true });
  return r.status === 0;
}

function forceStopService(): void {
  console.log(`Stopping service "${SERVICE_ID}"...`);
  cp.spawnSync('sc.exe', ['stop', SERVICE_ID], { windowsHide: true, encoding: 'utf8' });

  // Wait up to 10s for the service to report STOPPED.
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const check = cp.spawnSync('sc.exe', ['query', SERVICE_ID], { windowsHide: true, encoding: 'utf8' });
    const output = (check.stdout || '') + (check.stderr || '');
    if (output.includes('STOPPED') || output.includes('does not exist')) break;
    sleepSync(1000);
  }
}

function deleteService(): void {
  console.log(`Deleting service "${SERVICE_ID}" from SCM...`);
  const r = cp.spawnSync('sc.exe', ['delete', SERVICE_ID], { windowsHide: true, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('sc delete failed:', (r.stderr || '').trim());
  }
}

function pollServiceGoneSync(timeoutMs: number): boolean {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!serviceExists()) return true;
    sleepSync(1000);
  }
  return false;
}

function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* busy-wait */ }
}

function runCleanup() {
  if (!fs.existsSync(cleanupPath)) {
    console.warn('Cleanup script not found:', cleanupPath);
    return;
  }

  const env = { ...process.env };
  if (path.basename(process.execPath).toLowerCase() !== 'node.exe') {
    env.ELECTRON_RUN_AS_NODE = '1';
  }
  if (args.userData) {
    env.FRICTION_USER_DATA = args.userData;
  }

  const child = cp.spawnSync(process.execPath, [cleanupPath], {
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (child.status !== 0) {
    console.error('Cleanup exited with code', child.status);
    process.exit(child.status || 1);
  }
}

function parseArgs(argv: string[]) {
  const out: { userData?: string; logFile?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--user-data' && argv[i + 1]) {
      out.userData = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--log-file' && argv[i + 1]) {
      out.logFile = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

function setupLog(logFile?: string) {
  if (!logFile) return;
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.writeFileSync(logFile, `[${new Date().toISOString()}] Service uninstall started\n`, 'utf8');

  const append = (level: string, values: unknown[]) => {
    const line = values.map((v) => {
      if (typeof v === 'string') return v;
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    }).join(' ');
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] [${level}] ${line}\n`, 'utf8');
  };

  const originalLog = console.log.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);
  console.log = (...values: unknown[]) => {
    append('info', values);
    originalLog(...values);
  };
  console.warn = (...values: unknown[]) => {
    append('warn', values);
    originalWarn(...values);
  };
  console.error = (...values: unknown[]) => {
    append('error', values);
    originalError(...values);
  };
}