import os from 'node:os';
import path from 'node:path';
import { Logger } from './logger.js';
import { removeManagedRegion } from './hostsWriter/index.js';
import { flushDns } from './dnsFlush.js';
import { startBlockingRuntime } from './runtime.js';

/**
 * Service entry point. Resolves the userData directory the same way Electron
 * does so the service and the app see the same config.json. Override with
 * FOCUS_BLOCKER_USER_DATA env var for dev/testing.
 */

function userDataDir(): string {
  if (process.env.FOCUS_BLOCKER_USER_DATA) return process.env.FOCUS_BLOCKER_USER_DATA;
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Focus Blocker');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Focus Blocker');
  }
  return path.join(os.homedir(), '.config', 'focus-blocker');
}

async function main() {
  const dir = userDataDir();
  const logger = new Logger({ dir, source: 'service' });
  logger.info(`Service starting. userData=${dir}`);

  const runtime = await startBlockingRuntime({
    dir,
    logger,
    configPath: path.join(dir, 'config.json'),
    hostsPath: process.env.FOCUS_BLOCKER_HOSTS_PATH,
  });

  const shutdown = async (reason: string) => {
    logger.info(`Service shutting down: ${reason}`);
    await runtime.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception: ${err?.message ?? err}\n${err?.stack ?? ''}`);
  });
  process.on('unhandledRejection', (err: any) => {
    logger.error(`Unhandled rejection: ${err?.message ?? err}`);
  });
}

/** Uninstall hook: clears our managed region from the hosts file. */
export async function uninstallCleanup(): Promise<void> {
  await removeManagedRegion();
  await flushDns();
}

main().catch((err) => {
  console.error('Fatal service error:', err);
  process.exit(1);
});
