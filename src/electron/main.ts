import { app, BrowserWindow } from 'electron';
import { isDev } from './util.js';
import { getPreloadPath, getUIPath } from './pathResolver.js';
import { createTray } from './tray.js';
import { ConfigStore } from './configStore.js';
import { Logger } from '../service/logger.js';
import { registerIpc } from './ipc.js';
import { startBlockingRuntime, type BlockingRuntime } from '../service/runtime.js';

let mainWindow: BrowserWindow | null = null;
let blockingRuntime: BlockingRuntime | null = null;

app.on('ready', async () => {
  const userData = app.getPath('userData');
  const logger = new Logger({ dir: userData, source: 'app' });
  const store = new ConfigStore(userData);

  // Ensure config exists on first run.
  const config = await store.readOrInitDefault();

  if (isDev()) {
    blockingRuntime = await startBlockingRuntime({
      dir: userData,
      logger,
      configPath: store.filePath(),
      hostsPath: process.env.FOCUS_BLOCKER_HOSTS_PATH,
    });
    await blockingRuntime.apply(config);
  }

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: false,
    backgroundColor: '#020617',
  });

  if (isDev()) {
    mainWindow.loadURL('http://localhost:5123');
  } else {
    mainWindow.loadFile(getUIPath());
  }

  registerIpc({
    store,
    logger,
    getMainWindow: () => mainWindow,
    onConfigChanged: async (cfg) => {
      await blockingRuntime?.apply(cfg);
    },
  });
  createTray(mainWindow);
  handleCloseEvents(mainWindow);
  logger.info('App ready.');

  app.on('before-quit', () => {
    void blockingRuntime?.stop();
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
