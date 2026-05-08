import { app, BrowserWindow, shell } from 'electron';
import { ipcMainHandle, ipcMainOn, ipcWebContentsSend } from './util.js';
import { ConfigStore } from './configStore.js';
import { Logger } from '../service/logger.js';
import { evaluate, minuteOfDay } from '../shared/scheduleEngine.js';
import { removeManagedRegion } from '../service/hostsWriter/index.js';
import { HeartbeatReader } from './heartbeatReader.js';
import type { BlockerConfig, BlockerStatus } from '../shared/types.js';

export interface IpcDeps {
  store: ConfigStore;
  logger: Logger;
  getMainWindow: () => BrowserWindow | null;
  onConfigChanged?: (cfg: BlockerConfig) => Promise<void> | void;
}

export function registerIpc(deps: IpcDeps): () => void {
  const { store, logger, getMainWindow, onConfigChanged } = deps;
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

  ipcMainHandle('activate', async () => flipActive(store, true, logger, getMainWindow(), heartbeat, onConfigChanged));
  ipcMainHandle('deactivate', async () => flipActive(store, false, logger, getMainWindow(), heartbeat, onConfigChanged));

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

  ipcMainOn('sendFrameAction', (payload) => {
    const win = getMainWindow();
    if (!win) return;
    switch (payload) {
      case 'CLOSE': win.close(); break;
      case 'MAXIMIZE': win.isMaximized() ? win.unmaximize() : win.maximize(); break;
      case 'MINIMIZE': win.minimize(); break;
    }
  });

  // Push status updates to the renderer every 5s while the window is open.
  // Keeps the UI's "service running" indicator honest without each component
  // having to poll.
  const win = getMainWindow();
  const pushStatus = async () => {
    const w = getMainWindow();
    if (!w || w.isDestroyed()) return;
    try {
      ipcWebContentsSend('status-changed', w.webContents, await computeStatus(store, heartbeat));
    } catch {}
  };
  const interval = setInterval(() => void pushStatus(), 5_000);
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
  return {
    active: cfg.active,
    serviceRunning: hb.alive,
    currentlyBlocking: ev.activeGroups,
    nextChange: ev.nextChangeAtMinute === null
      ? null
      : { atMinute: ev.nextChangeAtMinute, willBlock: [] },
    lastError: hb.data?.lastError ?? null,
  };
}
