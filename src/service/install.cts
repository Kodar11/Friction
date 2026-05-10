/* eslint-disable @typescript-eslint/no-var-requires */
// Installs Focus Blocker as an auto-start Windows Service. Runs elevated.
//
// The installed service uses the app's own executable in Electron's Node mode
// (ELECTRON_RUN_AS_NODE=1), so end users do not need Node.js installed.

const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const os = require('os');

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
const SERVICE_ID = 'focusblockerservice';
const SERVICE_DISPLAY_NAME = 'Focus Blocker Service';

const args = parseArgs(process.argv.slice(2));
setupLog(args.logFile);

const repoRoot = path.resolve(__dirname, '..', '..');
const serviceScript = path.join(repoRoot, 'dist-electron', 'service', 'index.js');
const electronOrNodeExe = args.execPath || process.execPath;
const programData = process.env.ProgramData || path.join(process.env.SystemDrive || 'C:', 'ProgramData');
const serviceDir = path.join(programData, 'Focus Blocker', 'service');
const serviceExe = path.join(serviceDir, `${SERVICE_ID}.exe`);
const serviceXml = path.join(serviceDir, `${SERVICE_ID}.xml`);
const userDataPath =
  args.userData ||
  path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Focus Blocker');

if (!fs.existsSync(serviceScript)) {
  console.error('Service script not found:', serviceScript);
  console.error('Run `npm run transpile:electron` first.');
  process.exit(1);
}

fs.mkdirSync(serviceDir, { recursive: true });

if (serviceExists()) {
  console.log('Existing service found. Reinstalling with current paths...');
  runAllowFailure(serviceExe, ['stop']);
  if (fs.existsSync(serviceExe)) {
    runChecked(serviceExe, ['uninstall'], 'uninstall existing service');
  } else {
    runChecked('sc.exe', ['delete', SERVICE_NAME], 'delete existing service');
  }
}

copyWinsw(serviceExe);
writeXml(serviceXml);

runChecked(serviceExe, ['install'], 'install service');
runAllowFailure('sc.exe', ['config', SERVICE_NAME, 'start=', 'auto']);
runChecked(serviceExe, ['start'], 'start service');

if (!waitForRunning()) {
  console.error('Service was installed, but it did not reach RUNNING state.');
  process.exit(2);
}

console.log('FocusBlockerService is installed and running.');
process.exit(0);

function copyWinsw(dest: string) {
  const base = path.dirname(require.resolve('node-windows/package.json'));
  const exeOrigin = path.join(base, 'bin', 'winsw', 'winsw.exe');
  const cfgOrigin = path.join(base, 'bin', 'winsw', 'winsw.exe.config');
  fs.copyFileSync(exeOrigin, dest);
  fs.copyFileSync(cfgOrigin, `${dest}.config`);
}

function writeXml(dest: string) {
  const isElectron = path.basename(electronOrNodeExe).toLowerCase() !== 'node.exe';
  const envBlock = isElectron
    ? `\r\n  <env name="ELECTRON_RUN_AS_NODE" value="1" />`
    : '';

  const xml =
    `<service>\r\n` +
    `  <id>${SERVICE_NAME}</id>\r\n` +
    `  <name>${SERVICE_DISPLAY_NAME}</name>\r\n` +
    `  <description>Schedules website blocking via the system hosts file.</description>\r\n` +
    `  <executable>${xmlEscape(electronOrNodeExe)}</executable>\r\n` +
    `  <argument>${xmlEscape(serviceScript)}</argument>\r\n` +
    `  <startmode>Automatic</startmode>\r\n` +
    `  <logmode>rotate</logmode>\r\n` +
    `  <logpath>${xmlEscape(serviceDir)}</logpath>\r\n` +
    `  <workingdirectory>${xmlEscape(repoRoot)}</workingdirectory>\r\n` +
    `  <env name="FOCUS_BLOCKER_USER_DATA" value="${xmlEscape(userDataPath)}" />${envBlock}\r\n` +
    `</service>\r\n`;

  fs.writeFileSync(dest, xml, 'utf8');
}

function serviceExists(): boolean {
  const r = cp.spawnSync('sc.exe', ['query', SERVICE_NAME], { windowsHide: true });
  return r.status === 0;
}

function waitForRunning(): boolean {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const r = cp.spawnSync('sc.exe', ['query', SERVICE_NAME], {
      windowsHide: true,
      encoding: 'utf8',
    });
    const output = `${r.stdout || ''}\n${r.stderr || ''}`;
    if (/RUNNING/i.test(output)) return true;
    sleep(500);
  }
  return false;
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
  const out: { userData?: string; execPath?: string; logFile?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--user-data' && value) {
      out.userData = value;
      i += 1;
    } else if (key === '--exec-path' && value) {
      out.execPath = value;
      i += 1;
    } else if (key === '--log-file' && value) {
      out.logFile = value;
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

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isAdmin(): boolean {
  try {
    cp.execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // WinSW service operations are synchronous enough here; keep the installer
    // process simple and dependency-free.
  }
}
