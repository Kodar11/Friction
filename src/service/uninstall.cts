/* eslint-disable @typescript-eslint/no-var-requires */
// Uninstalls FocusBlockerService and clears the managed hosts-file region.
// Must be run as Administrator.

const path = require('path');
const fs = require('fs');
const cp = require('child_process');

if (process.platform !== 'win32') {
  console.error('This uninstaller only supports Windows.');
  process.exit(1);
}

const SERVICE_NAME = 'FocusBlockerService';
const SERVICE_ID = 'focusblockerservice';

const args = parseArgs(process.argv.slice(2));
setupLog(args.logFile);

const repoRoot = path.resolve(__dirname, '..', '..');
const cleanupPath = path.join(repoRoot, 'dist-electron', 'service', 'cleanup.js');
const programData = process.env.ProgramData || path.join(process.env.SystemDrive || 'C:', 'ProgramData');
const serviceDir = path.join(programData, 'Focus Blocker', 'service');
const serviceExe = path.join(serviceDir, `${SERVICE_ID}.exe`);

if (serviceExists()) {
  if (fs.existsSync(serviceExe)) {
    runAllowFailure(serviceExe, ['stop']);
    runChecked(serviceExe, ['uninstall'], 'uninstall service');
  } else {
    runAllowFailure('sc.exe', ['stop', SERVICE_NAME]);
    runChecked('sc.exe', ['delete', SERVICE_NAME], 'delete service');
  }
}

runCleanup();
console.log('FocusBlockerService is uninstalled.');
process.exit(0);

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
    env.FOCUS_BLOCKER_USER_DATA = args.userData;
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

function serviceExists(): boolean {
  const r = cp.spawnSync('sc.exe', ['query', SERVICE_NAME], { windowsHide: true });
  return r.status === 0;
}

function runChecked(file: string, runArgs: string[], label: string) {
  const r = cp.spawnSync(file, runArgs, {
    windowsHide: true,
    encoding: 'utf8',
  });
  if (r.status === 0) return;
  console.error(`Failed to ${label}.`);
  if (r.stdout) console.error(r.stdout.trim());
  if (r.stderr) console.error(r.stderr.trim());
  process.exit(r.status || 1);
}

function runAllowFailure(file: string, runArgs: string[]) {
  cp.spawnSync(file, runArgs, {
    windowsHide: true,
    encoding: 'utf8',
  });
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
