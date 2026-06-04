/* eslint-disable @typescript-eslint/no-var-requires */
// Installs Focus Blocker as an auto-start Windows Service. Runs elevated.
//
// Critical detail: the installed service runs as LocalSystem, whose
// %APPDATA% is `C:\Windows\System32\config\systemprofile\...` — NOT the
// real user's roaming dir. We pin the service to the *user's* userData via
// FOCUS_BLOCKER_USER_DATA so it sees the same config.json the app writes.
//
// If a previous version is registered, we uninstall+reinstall so the env
// var is actually updated.

const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const os = require('os');
const { Service } = require('node-windows');

if (process.platform !== 'win32') {
  console.error('This installer only supports Windows.');
  process.exit(1);
}

// Check for admin privileges
if (!isAdmin()) {
  console.error('ERROR: This installer requires administrator privileges.');
  console.error('Please right-click the installer and select "Run as administrator".');
  process.exit(3);
}

const SERVICE_NAME = 'FocusBlockerService';
const SERVICE_DISPLAY_NAME = 'Focus Blocker Service';

const args = parseArgs(process.argv.slice(2));
setupLog(args.logFile);

const repoRoot = path.resolve(__dirname, '..', '..');
const serviceScript = path.join(repoRoot, 'dist-electron', 'service', 'index.js');
const electronOrNodeExe = args.execPath || process.execPath;
const userAppData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const userDataPath = args.userData || path.join(userAppData, 'Focus Blocker');

if (!fs.existsSync(serviceScript)) {
  console.error('Service script not found:', serviceScript);
  console.error('Run `npm run transpile:electron` first.');
  process.exit(1);
}

console.log(`User data path for service: ${userDataPath}`);

const env = [{ name: 'FOCUS_BLOCKER_USER_DATA', value: userDataPath }];
if (path.basename(electronOrNodeExe).toLowerCase() !== 'node.exe') {
  env.push({ name: 'ELECTRON_RUN_AS_NODE', value: '1' });
}

const svc = new Service({
  name: SERVICE_NAME,
  displayName: SERVICE_DISPLAY_NAME,
  description: 'Focus Blocker — schedules website blocking via the hosts file.',
  script: serviceScript,
  execPath: electronOrNodeExe,
  env,
  wait: 2,
  grow: 0.5,
  maxRestarts: 10,
});

let phase: 'install' | 'reinstall' = 'install';

svc.on('install', () => {
  console.log('Service installed. Starting…');
  svc.start();
});

svc.on('alreadyinstalled', () => {
  console.log('Service already exists. Reinstalling so the env vars refresh…');
  phase = 'reinstall';
  svc.uninstall();
});

svc.on('uninstall', () => {
  if (phase === 'reinstall') {
    console.log('Old service removed. Installing fresh…');
    phase = 'install';
    svc.install();
  }
});

svc.on('start', () => {
  console.log('FocusBlockerService is running.');
  // Block the parent PowerShell `-Wait` until we're actually up.
  process.exit(0);
});

svc.on('error', (err: unknown) => {
  console.error('Service error:', err);
  process.exit(1);
});

// Safety: don't hang the elevated process forever if node-windows wedges.
setTimeout(() => {
  console.error('Install timed out after 90s.');
  process.exit(2);
}, 90_000);

svc.install();

function isAdmin(): boolean {
  if (process.platform !== 'win32') return false;
  const r = cp.spawnSync('net', ['session'], { windowsHide: true });
  return r.status === 0;
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
