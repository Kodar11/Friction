/* eslint-disable @typescript-eslint/no-var-requires */
// Uninstalls FocusBlockerService and then clears our managed region from
// the hosts file by spawning the cleanup entry. Must be run as Administrator.

const path = require('path');
const cp = require('child_process');

if (process.platform !== 'win32') {
  console.error('This uninstaller only supports Windows.');
  process.exit(1);
}

const Service = require('node-windows').Service;

const repoRoot = path.resolve(__dirname, '..', '..');
const scriptPath = path.join(repoRoot, 'dist-electron', 'service', 'index.js');
const cleanupPath = path.join(repoRoot, 'dist-electron', 'service', 'cleanup.js');

const svc = new Service({
  name: 'FocusBlockerService',
  script: scriptPath,
});

svc.on('uninstall', () => {
  console.log('Service uninstalled. Cleaning hosts file region…');
  const child = cp.spawnSync(process.execPath, [cleanupPath], {
    stdio: 'inherit',
  });
  if (child.status !== 0) {
    console.error('Cleanup exited with code', child.status);
    process.exitCode = child.status ?? 1;
  }
});

svc.on('error', (err: unknown) => {
  console.error('Uninstall error:', err);
  process.exitCode = 1;
});

svc.uninstall();
