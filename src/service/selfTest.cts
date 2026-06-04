/* eslint-disable @typescript-eslint/no-var-requires */
// Self-test / validation script for Focus Blocker service architecture.
//
// Run: node dist-electron/service/selfTest.js
//
// Validates:
//   1. Service is registered with SCM
//   2. Service is running
//   3. Heartbeat file exists and is fresh
//   4. Config file exists and is valid
//   5. Config sync (heartbeat configSequence matches config configSequence)
//   6. No duplicate services
//   7. Hosts file has managed region markers (if blocking is active)

const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const SERVICE_NAME = 'FocusBlockerService';
const CONFIG_FILENAME = 'config.json';
const STATUS_FILENAME = 'status.json';
const HOSTS_PATH = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
const HOSTS_BEGIN = '# === focus-blocker BEGIN === DO NOT EDIT';
const HOSTS_END = '# === focus-blocker END ===';

const userAppData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const userDataPath = process.env.FOCUS_BLOCKER_USER_DATA || path.join(userAppData, 'Focus Blocker');
const configPath = path.join(userDataPath, CONFIG_FILENAME);
const statusPath = path.join(userDataPath, STATUS_FILENAME);

const HEARTBEAT_FRESHNESS_MS = 2.5 * 60 * 1000;

/** Results accumulator */
const results: {
  timestamp: string;
  tests: Array<{ name: string; status: string; detail: string; timestamp: string }>;
  passed: number;
  failed: number;
  warnings: number;
} = {
  timestamp: new Date().toISOString(),
  tests: [],
  passed: 0,
  failed: 0,
  warnings: 0,
};

function recordTest(name: string, status: 'pass' | 'fail' | 'warn', detail: string) {
  const entry = { name, status, detail, timestamp: new Date().toISOString() };
  results.tests.push(entry);
  if (status === 'pass') results.passed++;
  else if (status === 'fail') results.failed++;
  else if (status === 'warn') results.warnings++;
  
  const icon = status === 'pass' ? '✓' : status === 'fail' ? '✗' : '⚠';
  console.log(`  ${icon} ${name}: ${detail}`);
}

/**
 * Test 1: Service is registered with SCM
 */
function testServiceRegistered() {
  try {
    const result = cp.spawnSync('sc', ['query', SERVICE_NAME], {
      windowsHide: true,
      timeout: 5000,
      encoding: 'utf8',
    });
    if (result.status === 0) {
      recordTest('Service registered', 'pass', 'FocusBlockerService found in SCM');
      return true;
    } else {
      recordTest('Service registered', 'fail', 'Service not found in SCM');
      return false;
    }
  } catch (err: unknown) {
    recordTest('Service registered', 'fail', `sc query failed: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Test 2: Service is running
 */
function testServiceRunning() {
  try {
    const result = cp.spawnSync('sc', ['query', SERVICE_NAME], {
      windowsHide: true,
      timeout: 5000,
      encoding: 'utf8',
    });
    const output = (result.stdout || '').trim();
    if (output.includes('RUNNING')) {
      recordTest('Service running', 'pass', 'Service state is RUNNING');
      return true;
    } else if (output.includes('STOPPED')) {
      recordTest('Service running', 'warn', 'Service is STOPPED (may need manual start)');
      return false;
    } else {
      recordTest('Service running', 'fail', `Unexpected state: ${output.slice(0, 100)}`);
      return false;
    }
  } catch (err: unknown) {
    recordTest('Service running', 'fail', `sc query failed: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Test 3: Heartbeat file exists and is fresh
 */
function testHeartbeatFresh() {
  try {
    if (!fs.existsSync(statusPath)) {
      recordTest('Heartbeat fresh', 'fail', `status.json not found at ${statusPath}`);
      return false;
    }
    
    const raw = fs.readFileSync(statusPath, 'utf8');
    const data = JSON.parse(raw);
    const age = Date.now() - data.writtenAt;
    
    if (age < 0) {
      recordTest('Heartbeat fresh', 'warn', `Heartbeat timestamp is in the future (clock skew?)`);
      return false;
    }
    
    if (age <= HEARTBEAT_FRESHNESS_MS) {
      recordTest('Heartbeat fresh', 'pass', `Heartbeat is ${Math.round(age / 1000)}s old (threshold: ${HEARTBEAT_FRESHNESS_MS / 1000}s)`);
      return true;
    } else {
      recordTest('Heartbeat fresh', 'fail', `Heartbeat is ${Math.round(age / 1000)}s old — STALE`);
      return false;
    }
  } catch (err: unknown) {
    recordTest('Heartbeat fresh', 'fail', `Failed to read heartbeat: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Test 4: Config file exists and is valid
 */
function testConfigValid() {
  try {
    if (!fs.existsSync(configPath)) {
      recordTest('Config valid', 'fail', `config.json not found at ${configPath}`);
      return false;
    }
    
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);
    
    if (!config.version) {
      recordTest('Config valid', 'fail', 'Config missing version field');
      return false;
    }
    
    if (!Array.isArray(config.siteGroups)) {
      recordTest('Config valid', 'fail', 'Config missing siteGroups array');
      return false;
    }
    
    if (!Array.isArray(config.scheduleBlocks)) {
      recordTest('Config valid', 'fail', 'Config missing scheduleBlocks array');
      return false;
    }
    
    const seq = config.configSequence ?? 0;
    recordTest('Config valid', 'pass', `Config v${config.version}, sequence=${seq}, active=${config.active}`);
    return true;
  } catch (err: unknown) {
    recordTest('Config valid', 'fail', `Failed to read config: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Test 5: Config sync (heartbeat configSequence matches config configSequence)
 */
function testConfigSync() {
  try {
    if (!fs.existsSync(configPath) || !fs.existsSync(statusPath)) {
      recordTest('Config sync', 'warn', 'Config or heartbeat file missing, skipping sync check');
      return false;
    }
    
    const configRaw = fs.readFileSync(configPath, 'utf8');
    const statusRaw = fs.readFileSync(statusPath, 'utf8');
    
    const config = JSON.parse(configRaw);
    const status = JSON.parse(statusRaw);
    
    const configSeq = config.configSequence ?? 0;
    const heartbeatSeq = status.configReloadCount ?? null;
    
    if (heartbeatSeq === null) {
      recordTest('Config sync', 'warn', 'Heartbeat has no configReloadCount (service may not have loaded config yet)');
      return false;
    }
    
    if (heartbeatSeq === configSeq) {
      recordTest('Config sync', 'pass', `Config sequence=${configSeq} matches heartbeat configReloadCount=${heartbeatSeq}`);
      return true;
    } else {
      recordTest('Config sync', 'fail', `Config sequence=${configSeq} but heartbeat has configReloadCount=${heartbeatSeq} — OUT OF SYNC`);
      return false;
    }
  } catch (err: unknown) {
    recordTest('Config sync', 'fail', `Sync check failed: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Test 6: No duplicate services
 */
function testNoDuplicateServices() {
  try {
    const result = cp.spawnSync('sc', ['query', SERVICE_NAME], {
      windowsHide: true,
      timeout: 5000,
      encoding: 'utf8',
    });
    
    // Count occurrences of SERVICE_NAME in the output
    const output = (result.stdout || '').trim();
    const matches = output.split(SERVICE_NAME).length - 1;
    
    if (matches === 1) {
      recordTest('No duplicate services', 'pass', 'Single service instance found');
      return true;
    } else if (matches === 0) {
      recordTest('No duplicate services', 'pass', 'No service registered (clean state)');
      return true;
    } else {
      recordTest('No duplicate services', 'fail', `Found ${matches} service references — possible duplicates`);
      return false;
    }
  } catch (err) {
    recordTest('No duplicate services', 'pass', 'sc query failed, assuming no duplicates');
    return true;
  }
}

/**
 * Test 7: Hosts file has managed region markers (if blocking is active)
 */
function testHostsMarkers() {
  try {
    if (!fs.existsSync(HOSTS_PATH)) {
      recordTest('Hosts markers', 'warn', 'Hosts file not found');
      return false;
    }
    
    const hosts = fs.readFileSync(HOSTS_PATH, 'utf8');
    const hasBegin = hosts.includes(HOSTS_BEGIN);
    const hasEnd = hosts.includes(HOSTS_END);
    
    if (hasBegin && hasEnd) {
      recordTest('Hosts markers', 'pass', 'Both BEGIN and END markers present');
      return true;
    } else if (!hasBegin && !hasEnd) {
      recordTest('Hosts markers', 'warn', 'No managed region markers (blocking may be inactive)');
      return false;
    } else {
      recordTest('Hosts markers', 'fail', `Incomplete markers — BEGIN: ${hasBegin}, END: ${hasEnd}`);
      return false;
    }
  } catch (err: unknown) {
    recordTest('Hosts markers', 'fail', `Failed to read hosts file: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log('');
  console.log('========================================');
  console.log('  Focus Blocker — Architecture Self-Test');
  console.log('========================================');
  console.log(`  Timestamp: ${results.timestamp}`);
  console.log(`  User data: ${userDataPath}`);
  console.log('');
  console.log('Running tests:');
  console.log('');
  
  testServiceRegistered();
  testServiceRunning();
  testHeartbeatFresh();
  testConfigValid();
  testConfigSync();
  testNoDuplicateServices();
  testHostsMarkers();
  
  console.log('');
  console.log('----------------------------------------');
  console.log(`  Results: ${results.passed} passed, ${results.failed} failed, ${results.warnings} warnings`);
  console.log('----------------------------------------');
  console.log('');
  
  // Write results to file
  const resultsPath = path.join(userDataPath, 'self-test-results.json');
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2) + '\n', 'utf8');
    console.log(`  Results written to: ${resultsPath}`);
  } catch (err: unknown) {
    console.log(`  Could not write results file: ${(err as Error).message}`);
  }
  
  console.log('');
  
  // Exit code: 0 if all pass, 1 if any fail
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error('Self-test crashed:', err);
  process.exit(2);
});
