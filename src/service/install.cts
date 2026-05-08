/* eslint-disable @typescript-eslint/no-var-requires */
// Installs Focus Blocker as a Windows Service. Runs elevated (UAC).
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
const os = require('os');

if (process.platform !== 'win32') {
  console.error('This installer only supports Windows.');
  process.exit(1);
}

const Service = require('node-windows').Service;

const repoRoot = path.resolve(__dirname, '..', '..');
const scriptPath = path.join(repoRoot, 'dist-electron', 'service', 'index.js');

if (!fs.existsSync(scriptPath)) {
  console.error('Service script not found:', scriptPath);
  console.error('Run `npm run transpile:electron` first.');
  process.exit(1);
}

// Elevated UAC keeps the user identity, so APPDATA points to the user's
// roaming dir here. Snapshot it for the service.
const userAppData =
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const userDataPath = path.join(userAppData, 'Focus Blocker');

console.log(`User data path for service: ${userDataPath}`);

const svc = new Service({
  name: 'FocusBlockerService',
  description: 'Focus Blocker — schedules website blocking via the hosts file.',
  script: scriptPath,
  env: [
    { name: 'FOCUS_BLOCKER_USER_DATA', value: userDataPath },
  ],
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
