import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Logger } from './logger.js';

const execFileAsync = promisify(execFile);

const SYSTEMROOT = process.env.SystemRoot || 'C:\\Windows';
const TASKKILL = path.join(SYSTEMROOT, 'System32', 'taskkill.exe');

const APP_TICK_MS = 5_000;

export { APP_TICK_MS };

export class ProcessBlocker {
  private readonly logger: Logger;
  private lastAppsKey = '';
  private killedApps: Set<string> = new Set();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async verify(): Promise<boolean> {
    try {
      await execFileAsync(TASKKILL, ['/?'], { windowsHide: true, timeout: 5_000 });
      this.logger.info(`[SERVICE] ProcessBlocker initialized. taskkill=${TASKKILL}`);
      return true;
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[SERVICE] ProcessBlocker self-test FAILED: taskkill not found at ${TASKKILL}: ${msg}`);
      return false;
    }
  }

  async apply(apps: string[]): Promise<void> {
    if (apps.length === 0) {
      if (this.lastAppsKey !== '') {
        this.logger.info('[SERVICE] App blocking deactivated — no apps to kill.');
        this.lastAppsKey = '';
        this.killedApps.clear();
      }
      return;
    }

    const appsKey = apps.join('|');
    if (appsKey !== this.lastAppsKey) {
      this.logger.info(`[SERVICE] App blocking active: ${apps.length} app(s) — [${apps.join(', ')}]`);
      this.lastAppsKey = appsKey;
      this.killedApps.clear();
    }

    for (const app of apps) {
      try {
        await execFileAsync(TASKKILL, ['/F', '/IM', app], {
          windowsHide: true,
          timeout: 5_000,
        });
        if (!this.killedApps.has(app)) {
          this.logger.info(`[SERVICE] Killed process: ${app}`);
          this.killedApps.add(app);
        }
      } catch {
        // Process not running or already exited — suppress, same as >nul 2>&1
      }
    }
  }

  stop(): void {
    this.lastAppsKey = '';
    this.killedApps.clear();
  }
}