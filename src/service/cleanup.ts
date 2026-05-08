// Standalone hosts-file cleanup entry. Spawned by the uninstaller after the
// Windows Service has been removed. Safe to run any time.

import { removeManagedRegion } from './hostsWriter/index.js';
import { flushDns } from './dnsFlush.js';

(async () => {
  try {
    const removed = await removeManagedRegion();
    if (removed) {
      console.log('Cleared focus-blocker region from hosts file.');
      await flushDns();
    } else {
      console.log('No focus-blocker region present.');
    }
  } catch (err: any) {
    console.error('Cleanup failed:', err?.message ?? err);
    process.exit(1);
  }
})();
