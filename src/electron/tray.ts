import { BrowserWindow, Menu, Tray, app, dialog } from 'electron';
import { getAssetPath } from './pathResolver.js';
import path from 'path';

/**
 * System tray. Window close minimises to tray (decision #2); explicit Quit
 * from the tray prompts for confirmation (decision #3) because exiting the
 * app does NOT stop blocking — but users routinely confuse the two.
 */
export function createTray(mainWindow: BrowserWindow) {
  const tray = new Tray(
    path.join(
      getAssetPath(),
      process.platform === 'darwin' ? 'trayIconTemplate.png' : 'trayIcon.png',
    ),
  );

  tray.setToolTip('Focus Blocker');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Show Focus Blocker',
        click: () => {
          mainWindow.show();
          if (app.dock) app.dock.show();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: async () => {
          const { response } = await dialog.showMessageBox(mainWindow, {
            type: 'question',
            buttons: ['Quit', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
            title: 'Quit Focus Blocker?',
            message: 'Quitting closes the app window. Blocking will continue in the background as long as the service is running.',
          });
          if (response === 0) app.quit();
        },
      },
    ]),
  );

  tray.on('click', () => {
    mainWindow.show();
    if (app.dock) app.dock.show();
  });
}
