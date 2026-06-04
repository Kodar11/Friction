/* eslint-disable @typescript-eslint/no-var-requires */
// Installs Focus Blocker as a Windows Service. Runs elevated (UAC).
//
// Critical detail: the installed service runs as LocalSystem, whose
// %APPDATA% is `C:\Windows\System32\config\systemprofile\...` — NOT the
// real user's roaming dir. We pin the service to the *user's* userData via
// FOCUS_BLOCKER_USER_DATA so it sees the same config.json the app writes.
//
// Install flow (always fresh reinstall):
//   1. Check if service exists (sc query)
//   2. If exists: sc stop → wait 3s → sc delete → wait 3s
//   3. Install fresh
//   4. Start service
//   5. Verify running

const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');

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

console.log(`[SERVICE] User data path for service: ${userDataPath}`);

const SERVICE_NAME = 'focusblockerservice';
/**
 * Check if the service is currently registered with SCM.
 */
function isServiceRegistered() {
  try {
    const result = cp.spawnSync('sc', ['query', SERVICE_NAME], {
      windowsHide: true,
      timeout: 5000,
      encoding: 'utf8',
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Stop the service if running. Returns true if stopped or already stopped.
 */
function stopService() {
  console.log('[SERVICE] Stopping existing service…');
  try {
    const result = cp.spawnSync('sc', ['stop', SERVICE_NAME], {
      windowsHide: true,
      timeout: 10000,
      encoding: 'utf8',
    });
    if (result.status === 0) {
      console.log('[SERVICE] Service stop signal sent.');
      return true;
    }
    const output = (result.stdout || '').trim();
    if (output.includes('1062') || (result.stderr || '').includes('1062')) {
      console.log('[SERVICE] Service already stopped.');
      return true;
    }
    console.error('[SERVICE] sc stop failed:', output || result.stderr);
    return false;
  } catch (err) {
    console.error('[SERVICE] sc stop exception:', err);
    return false;
  }
}

/**
 * Delete the service registration from SCM.
 */
function deleteService() {
  console.log('[SERVICE] Deleting service registration…');
  try {
    const result = cp.spawnSync('sc', ['delete', SERVICE_NAME], {
      windowsHide: true,
      timeout: 10000,
      encoding: 'utf8',
    });
    if (result.status === 0) {
      console.log('[SERVICE] Service deleted.');
      return true;
    }
    const output = (result.stdout || '').trim();
    if (output.includes('1072') || (result.stderr || '').includes('1072')) {
      console.log('[SERVICE] Service already marked for deletion.');
      return true;
    }
    console.error('[SERVICE] sc delete failed:', output || result.stderr);
    return false;
  } catch (err) {
    console.error('[SERVICE] sc delete exception:', err);
    return false;
  }
}

/**
 * Wait for the specified milliseconds.
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verify the service is running after install.
 */
function verifyRunning() {
  try {
    const result = cp.spawnSync('sc', ['query', SERVICE_NAME], {
      windowsHide: true,
      timeout: 5000,
      encoding: 'utf8',
    });
    const output = (result.stdout || '').trim();
    return output.includes('RUNNING');
  } catch {
    return false;
  }
}

// --- Main install flow ---

async function main() {
  // Step 1: Check if service exists
  const exists = isServiceRegistered();
  
  if (exists) {
    console.log('[SERVICE] Service already registered. Performing clean reinstall…');
    
    // Step 2a: Stop the service
    stopService();
    
    // Step 2b: Wait for SCM to fully stop
    console.log('[SERVICE] Waiting 3 seconds for service to fully stop…');
    await sleep(3000);
    
    // Step 2c: Delete the service
    deleteService();
    
    // Step 2d: Wait for SCM to fully delete
    console.log('[SERVICE] Waiting 3 seconds for service to fully delete…');
    await sleep(3000);
  } else {
    console.log('[SERVICE] No existing service found. Fresh install.');
  }

  // Step 3: Install fresh
  const svc = new Service({
    name: SERVICE_NAME,
    description: 'Focus Blocker — schedules website blocking via the hosts file.',
    script: scriptPath,
    env: [
      { name: 'FOCUS_BLOCKER_USER_DATA', value: userDataPath },
    ],
    wait: 2,
    grow: 0.5,
    maxRestarts: 10,
  });

  // svc.on('install', () => {
  //   console.log('[SERVICE] Service installed. Starting…');
  //   svc.start();
  // });
  svc.install();

  console.log('install called');

  svc.on('start', async () => {
    console.log('[SERVICE] FocusBlockerService is running.');
    
    // Step 5: Verify running
    await sleep(2000);
    if (verifyRunning()) {
      console.log('[SERVICE] Service verified: RUNNING');
    } else {
      console.warn('[SERVICE] Service started but verification pending (may still be initializing).');
    }
    
    // Block the parent PowerShell `-Wait` until we're actually up.
    process.exit(0);
  });

  svc.on('error', (err: unknown) => {
    console.error('[SERVICE] Service error:', err);
    process.exit(1);
  });

  // Safety: don't hang the elevated process forever if node-windows wedges.
  setTimeout(() => {
    console.error('[SERVICE] Install timed out after 90s.');
    process.exit(2);
  }, 90_000);

  svc.install();
}

main().catch((err) => {
  console.error('[SERVICE] Install failed:', err);
  process.exit(1);
});
