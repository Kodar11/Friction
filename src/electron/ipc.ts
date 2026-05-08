import { app, BrowserWindow, shell } from 'electron';
import { ipcMainHandle, ipcMainOn, ipcWebContentsSend, isDev } from './util.js';
import { ConfigStore } from './configStore.js';
import { Logger } from '../service/logger.js';
import { evaluate, minuteOfDay } from '../shared/scheduleEngine.js';
import { removeManagedRegion } from '../service/hostsWriter/index.js';
import { HeartbeatReader } from './heartbeatReader.js';
import { installServiceElevated, isServiceInstalled, relaunchAsAdmin, uninstallServiceElevated } from './elevation.js';
import { flushDns } from '../service/dnsFlush.js';
import type { BlockerConfig, BlockerStatus } from '../shared/types.js';

export interface IpcDeps {
  store: ConfigStore;
  logger: Logger;
  isAdmin: boolean;
  getMainWindow: () => BrowserWindow | null;
  onConfigChanged?: (cfg: BlockerConfig) => Promise<void> | void;
}

export function registerIpc(deps: IpcDeps): () => void {
  const { store, logger, isAdmin, getMainWindow, onConfigChanged } = deps;
  const heartbeat = new HeartbeatReader(app.getPath('userData'));

  ipcMainHandle('getConfig', async () => {
    return await store.readOrInitDefault();
  });

  ipcMainHandle('saveConfig', async (cfg: BlockerConfig) => {
    try {
      await store.write(cfg);
      await onConfigChanged?.(cfg);
      logger.info('Config written from app.');
      const win = getMainWindow();
      if (win) ipcWebContentsSend('config-changed', win.webContents, cfg);
      return { ok: true };
    } catch (err: any) {
      const message = err?.message ?? String(err);
      logger.error(`saveConfig failed: ${message}`);
      return { ok: false, error: message };
    }
  });

  ipcMainHandle('getStatus', async () => {
    return await computeStatus(store, heartbeat);
  });

  ipcMainHandle('activate', async () =>
    flipActive(store, true, logger, getMainWindow(), heartbeat, onConfigChanged),
  );
  ipcMainHandle('deactivate', async () =>
    flipActive(store, false, logger, getMainWindow(), heartbeat, onConfigChanged),
  );

  ipcMainHandle('restoreHostsFile', async () => {
    try {
      await removeManagedRegion();
      logger.info('Restore: managed hosts region cleared.');
      return { ok: true };
    } catch (err: any) {
      logger.error(`restoreHostsFile failed: ${err?.message ?? err}`);
      return { ok: false };
    }
  });

  ipcMainHandle('getLogs', async (limit: number) => {
    return await logger.tail(typeof limit === 'number' ? limit : 200);
  });

  ipcMainHandle('openLogFolder', async () => {
    await shell.openPath(app.getPath('userData'));
  });

  ipcMainHandle('setAutoLaunch', async (enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: !!enabled });
    const cfg = await store.readOrInitDefault();
    cfg.preferences.autoLaunchOnBoot = !!enabled;
    await store.write(cfg);
  });

  ipcMainHandle('getAdminState', async () => ({ isAdmin }));

  ipcMainHandle('flushDnsNow', async () => {
    logger.info('Manual DNS flush requested.');
    return await flushDns();
  });

  ipcMainHandle('relaunchAsAdmin', async () => {
    if (isAdmin) return { ok: true };
    logger.info('User requested admin relaunch.');
    const result = await relaunchAsAdmin();
    if (!result.ok) {
      logger.warn(`Relaunch as admin failed: ${result.error}`);
      return result;
    }
    if (isDev()) {
      // In `npm run dev`, Vite and Electron are siblings under npm-run-all;
      // killing this Electron would take Vite down with it, leaving the
      // elevated instance with a blank window at localhost:5123. Just hide
      // ourselves so Vite stays alive. The user can quit the helper from
      // the tray menu when they're done.
      const win = getMainWindow();
      if (win) win.hide();
      logger.info('Dev mode: hid unprivileged instance to keep Vite alive.');
    } else {
      logger.info('Admin instance spawned, quitting unprivileged instance.');
      setTimeout(() => app.quit(), 1000);
    }
    return result;
  });

  ipcMainHandle('openBrowserDnsPage', async () => {
    // Chromium-based browsers (Chrome / Edge / Brave / Opera) all expose
    // chrome://net-internals/#dns. Brave maps it to brave://, Edge to
    // edge://, etc. — same target. shell.openExternal hands it to the user's
    // default browser; if that browser is Firefox the URL won't resolve and
    // we surface that as an error.
    try {
      await shell.openExternal('chrome://net-internals/#dns');
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Could not open browser DNS page.' };
    }
  });

  ipcMainHandle('getServiceState', async () => {
    const installed = await isServiceInstalled();
    const hb = await heartbeat.read();
    return { installed, running: installed && hb.alive };
  });

  ipcMainHandle('installService', async () => {
    logger.info('Install requested via UI.');
    const result = await installServiceElevated();
    if (result.ok) {
      logger.info('Service install completed.');
      // Push status promptly so UI updates without waiting for the next poll.
      void pushStatus();
    } else {
      logger.warn(`Service install failed: ${result.error}`);
    }
    return result;
  });

  ipcMainHandle('uninstallService', async () => {
    logger.info('Uninstall requested via UI.');
    const result = await uninstallServiceElevated();
    if (result.ok) logger.info('Service uninstall completed.');
    else logger.warn(`Service uninstall failed: ${result.error}`);
    return result;
  });

  ipcMainOn('sendFrameAction', (payload) => {
    const win = getMainWindow();
    if (!win) return;
    switch (payload) {
      case 'CLOSE': win.close(); break;
      case 'MAXIMIZE': win.isMaximized() ? win.unmaximize() : win.maximize(); break;
      case 'MINIMIZE': win.minimize(); break;
    }
  });

  // Keep the renderer's status fresh without each component polling.
  const pushStatus = async () => {
    const w = getMainWindow();
    if (!w || w.isDestroyed()) return;
    try {
      ipcWebContentsSend('status-changed', w.webContents, await computeStatus(store, heartbeat));
    } catch {}
  };
  const interval = setInterval(() => void pushStatus(), 5_000);
  const win = getMainWindow();
  if (win) win.on('show', () => void pushStatus());

  return () => clearInterval(interval);
}

async function flipActive(
  store: ConfigStore,
  active: boolean,
  logger: Logger,
  win: BrowserWindow | null,
  heartbeat: HeartbeatReader,
  onConfigChanged?: (cfg: BlockerConfig) => Promise<void> | void,
): Promise<{ ok: boolean }> {
  try {
    const cfg = await store.readOrInitDefault();
    if (cfg.active === active) return { ok: true };
    cfg.active = active;
    await store.write(cfg);
    await onConfigChanged?.(cfg);
    logger.info(`Active flipped: ${active}`);

    // Belt-and-suspenders: the runtime already flushes DNS whenever the hosts
    // file changes, but we explicitly flush again on every Activate/Deactivate
    // so the user sees an immediate effect even on edge cases (no-op apply,
    // re-activate when already active, etc.).
    const flush = await flushDns();
    if (flush.ok) {
      logger.info(`DNS flushed after ${active ? 'activate' : 'deactivate'}.`);
    } else {
      logger.warn(`DNS flush after ${active ? 'activate' : 'deactivate'} failed: ${flush.error}`);
    }

    if (win) {
      ipcWebContentsSend('config-changed', win.webContents, cfg);
      ipcWebContentsSend('status-changed', win.webContents, await computeStatus(store, heartbeat));
    }
    return { ok: true };
  } catch (err: any) {
    logger.error(`flipActive(${active}) failed: ${err?.message ?? err}`);
    return { ok: false };
  }
}

async function computeStatus(store: ConfigStore, heartbeat: HeartbeatReader): Promise<BlockerStatus> {
  const cfg = await store.readOrInitDefault();
  const ev = evaluate(cfg, minuteOfDay(new Date()));
  const hb = await heartbeat.read();

  const permissionDenied = hb.data?.errorKind === 'permission';
  // When we know the cause is permission, surface a clear actionable message
  // rather than the raw OS message.
  const lastError = permissionDenied
    ? "Focus Blocker can't edit the system hosts file without admin permission. " +
      "Install the background service (one-time) to fix this."
    : hb.data?.lastError ?? null;

  return {
    active: cfg.active,
    serviceRunning: hb.alive,
    permissionDenied,
    currentlyBlocking: ev.activeGroups,
    nextChange: ev.nextChangeAtMinute === null
      ? null
      : { atMinute: ev.nextChangeAtMinute, willBlock: [] },
    lastError,
    lastFlushedAt: hb.data?.lastFlushedAt ?? null,
  };
}
