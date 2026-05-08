/* eslint-disable @typescript-eslint/no-var-requires */
// Installs Focus Blocker as a Windows Service. Must be run as Administrator.
//
// Usage:
//   npm run service:install
//
// The installed service runs `node dist-electron/service/index.js` as
// LocalSystem (which is allowed to write to C:\Windows\System32\drivers\etc\hosts).

const path = require('path');
const fs = require('fs');

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

const svc = new Service({
  name: 'FocusBlockerService',
  description: 'Focus Blocker — schedules website blocking via the hosts file.',
  script: scriptPath,
  // Force a recent Node so we get fs.statfsSync, AbortController, etc.
  // node-windows runs the script with the host Node by default; we leave that
  // implicit so the user's Node version is used.
  wait: 2,
  grow: 0.5,
  maxRestarts: 10,
});

svc.on('install', () => {
  console.log('Service installed. Starting…');
  svc.start();
});

svc.on('alreadyinstalled', () => {
  console.log('Service is already installed.');
});

svc.on('start', () => {
  console.log('FocusBlockerService is running.');
});

svc.on('error', (err: unknown) => {
  console.error('Service install error:', err);
  process.exitCode = 1;
});

svc.install();
