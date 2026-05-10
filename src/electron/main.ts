// Belt-and-suspenders for the elevation flow: UAC doesn't reliably forward
// env vars, so the relaunched admin instance won't have NODE_ENV set even
// though it was launched from a dev session. We pass --dev as an argv flag
// from elevation.ts; mirror that into NODE_ENV here so any third-party code
// that reads process.env.NODE_ENV (rather than our isDev()) also sees dev.
// Done before any other imports so it lands before module init code runs.
if (process.argv.includes('--dev') && process.env.NODE_ENV !== 'development') {
  process.env.NODE_ENV = 'development';
}

import { app, BrowserWindow } from 'electron';
import { isDev } from './util.js';
import { getPreloadPath, getUIPath } from './pathResolver.js';
import { createTray } from './tray.js';
import { ConfigStore } from './configStore.js';
import { Logger } from '../service/logger.js';
import { ActivityLogger } from '../service/activityLogger.js';
import { registerIpc } from './ipc.js';
import { TransitionNotifier } from './notifier.js';
import { WeeklySummary } from './weeklySummary.js';

let mainWindow: BrowserWindow | null = null;
let notifier: TransitionNotifier | null = null;
let weekly: WeeklySummary | null = null;
let notifierTick: ReturnType<typeof setInterval> | null = null;

app.on('ready', async () => {
  const userData = app.getPath('userData');
  const logger = new Logger({ dir: userData, source: 'app' });
  const store = new ConfigStore(userData);

  // Ensure config exists on first run.
  const config = await store.readOrInitDefault();

  // The Electron UI NEVER writes the hosts file directly.
  // Blocking is always handled by the Windows Service (installed once via
  // UAC). This keeps the UI unelevated and the service survives app restarts.
  logger.info('App starting. Blocking is handled by the background service.');

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: false,
    backgroundColor: '#191919',
  });

  if (isDev()) {
    mainWindow.loadURL('http://localhost:5123');
  } else {
    mainWindow.loadFile(getUIPath());
  }

  // Notifications: a transition notifier + a Sunday-8PM weekly summary.
  // Both share the same activity log file the runtime writes to.
  const activity = new ActivityLogger({ dir: userData });
  notifier = new TransitionNotifier(logger);
  weekly = new WeeklySummary(logger, activity, () => store.readOrInitDefault());
  notifier.update(config);
  weekly.update(config);
  // Re-evaluate the transition notifier every minute so it picks up clock
  // progression even when the config doesn't change.
  notifierTick = setInterval(() => {
    void store.readOrInitDefault().then((c) => notifier?.update(c)).catch(() => undefined);
  }, 60_000);

  registerIpc({
    store,
    logger,
    isAdmin: false,
    getMainWindow: () => mainWindow,
    onConfigChanged: async (cfg) => {
      notifier?.update(cfg);
      weekly?.update(cfg);
    },
  });
  createTray(mainWindow);
  handleCloseEvents(mainWindow);
  logger.info('App ready.');

  app.on('before-quit', () => {
    if (notifierTick) clearInterval(notifierTick);
    notifier?.stop();
    weekly?.stop();
  });
});

function handleCloseEvents(win: BrowserWindow) {
  let willClose = false;

  win.on('close', (e) => {
    if (willClose) return;
    e.preventDefault();
    win.hide();
    if (app.dock) app.dock.hide();
  });

  app.on('before-quit', () => {
    willClose = true;
  });

  win.on('show', () => {
    willClose = false;
  });
}
