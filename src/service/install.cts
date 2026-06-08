/* eslint-disable @typescript-eslint/no-var-requires */
// Installs Friction as an auto-start Windows Service. Runs elevated.
//
// Critical detail: the installed service runs as LocalSystem, whose
// %APPDATA% is `C:\Windows\System32\config\systemprofile\...` — NOT the
// real user's roaming dir. We pin the service to the *user's* userData via
// FRICTION_USER_DATA so it sees the same config.json the app writes.
//
// If a previous version is registered, we force-stop and delete it first,
// then poll until the SCM confirms it's gone, before installing fresh.
// The old node-windows `alreadyinstalled` event chain was unreliable
// because `winsw.exe uninstall` returns immediately while the SCM keeps
// the service in "marked for deletion" state, causing reinstall to fail.

const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const os = require('os');
const { Service } = require('node-windows');

if (process.platform !== 'win32') {
  console.error('This installer only supports Windows.');
  process.exit(1);
}

if (!isAdmin()) {
  console.error('ERROR: This installer requires administrator privileges.');
  console.error('Please right-click the installer and select "Run as administrator".');
  process.exit(3);
}

// node-windows generates the SCM internal name as: name.replace(/[^\w]/gi, '').toLowerCase()
// "FrictionService" → "frictionservice". The winsw <id> is set to _exe = id + '.exe' = "frictionservice.exe".
// sc.exe commands must use the internal name, not the display name.
const SERVICE_ID = 'frictionservice.exe';
const SERVICE_NAME = 'FrictionService';

const args = parseArgs(process.argv.slice(2));
setupLog(args.logFile);

const repoRoot = path.resolve(__dirname, '..', '..');
const serviceScript = path.join(repoRoot, 'dist-electron', 'service', 'index.js');
const electronOrNodeExe = args.execPath || process.execPath;
const userAppData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const userDataPath = args.userData || path.join(userAppData, 'Friction');

if (!fs.existsSync(serviceScript)) {
  console.error('Service script not found:', serviceScript);
  console.error('Run `npm run transpile:electron` first.');
  process.exit(1);
}

console.log(`User data path for service: ${userDataPath}`);

async function main() {
  // Step 1: If a service with the same ID is already registered, force-remove it.
  if (serviceExists()) {
    console.log(`Existing service "${SERVICE_ID}" found. Removing before reinstall...`);
    forceStopService();
    deleteService();

    // Poll until the SCM confirms the service is fully gone (up to 30s).
    const removed = await pollServiceGone(30_000);
    if (!removed) {
      console.error(`Timed out waiting for service "${SERVICE_ID}" to be removed from SCM.`);
      process.exit(1);
    }
    console.log('Old service removed from SCM.');

    // Give the filesystem a moment to release locks on daemon files.
    await sleep(1000);
  }

  // Step 2: Clean install via node-windows.
  const env = [{ name: 'FRICTION_USER_DATA', value: userDataPath }];
  if (path.basename(electronOrNodeExe).toLowerCase() !== 'node.exe') {
    env.push({ name: 'ELECTRON_RUN_AS_NODE', value: '1' });
  }

  const svc = new Service({
    name: SERVICE_NAME,
    displayName: 'Friction Service',
    description: 'Friction — schedules website blocking via the hosts file.',
    script: serviceScript,
    execPath: electronOrNodeExe,
    env,
    wait: 2,
    grow: 0.5,
    maxRestarts: 10,
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Install timed out after 90s.'));
    }, 90_000);

    svc.on('install', () => {
      console.log('Service installed. Starting…');
      svc.start();
    });

    svc.on('alreadyinstalled', () => {
      // This should not happen since we removed the service above, but handle it.
      console.error('Service reported as already installed despite removal. Attempting fresh install...');
      svc.uninstall();
    });

    svc.on('start', () => {
      console.log('FrictionService is running.');
      clearTimeout(timeout);
      resolve();
    });

    svc.on('error', (err: unknown) => {
      console.error('Service error:', err);
      clearTimeout(timeout);
      reject(err);
    });

    svc.install();
  }).then(
    () => { process.exit(0); },
    () => { process.exit(1); },
  );
}

main();

// ---------- Helpers ----------

function isAdmin(): boolean {
  if (process.platform !== 'win32') return false;
  const r = cp.spawnSync('net', ['session'], { windowsHide: true });
  return r.status === 0;
}

function serviceExists(): boolean {
  const r = cp.spawnSync('sc.exe', ['query', SERVICE_ID], { windowsHide: true });
  return r.status === 0;
}

function forceStopService(): void {
  console.log(`Stopping service "${SERVICE_ID}"...`);
  const r = cp.spawnSync('sc.exe', ['stop', SERVICE_ID], { windowsHide: true, encoding: 'utf8' });
  // sc stop returns 0 if running, 1 if already stopped, etc. Ignore errors.
  if (r.status === 0) {
    console.log('Stop command sent. Waiting for service to stop...');
  }
  // Wait briefly for the service to actually stop.
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

async function pollServiceGone(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!serviceExists()) return true;
    await sleep(1000);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* busy-wait */ }
}

function parseArgs(argv: string[]) {
  const out: { userData?: string; execPath?: string; logFile?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--user-data' && argv[i + 1]) {
      out.userData = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--exec-path' && argv[i + 1]) {
      out.execPath = argv[i + 1];
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
  fs.writeFileSync(logFile, `[${new Date().toISOString()}] Service install started\n`, 'utf8');

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