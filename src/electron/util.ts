import { ipcMain, WebContents, WebFrameMain } from 'electron';
import { getUIPath } from './pathResolver.js';
import { pathToFileURL } from 'url';

export function isDev(): boolean {
  // NODE_ENV is the primary signal (set by `cross-env` in `npm run dev`),
  // but UAC elevation doesn't reliably forward env vars to the new process,
  // so we also accept an explicit `--dev` argv flag that the elevated
  // relaunch path adds. Without this, the admin instance flips to
  // file://dist-react which is empty/stale → black window.
  return process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
}

/**
 * Wrap ipcMain.handle with frame validation. Handler may take an optional
 * payload arg. Return type is the matching key in EventPayloadMapping or a
 * Promise of it.
 */
export function ipcMainHandle<Key extends keyof EventPayloadMapping>(
  key: Key,
  handler: (payload?: any) => EventPayloadMapping[Key] | Promise<EventPayloadMapping[Key]>,
) {
  ipcMain.handle(key, async (event, payload) => {
    validateEventFrame(event.senderFrame);
    return await handler(payload);
  });
}

export function ipcMainOn<Key extends keyof EventPayloadMapping>(
  key: Key,
  handler: (payload: EventPayloadMapping[Key]) => void,
) {
  ipcMain.on(key, (event, payload) => {
    validateEventFrame(event.senderFrame);
    return handler(payload);
  });
}

export function ipcWebContentsSend<Key extends keyof EventPayloadMapping>(
  key: Key,
  webContents: WebContents,
  payload: EventPayloadMapping[Key],
) {
  webContents.send(key, payload);
}

export function validateEventFrame(frame: WebFrameMain | null) {
  if (!frame) return;
  if (isDev() && new URL(frame.url).host === 'localhost:5123') {
    return;
  }
  if (frame.url !== pathToFileURL(getUIPath()).toString()) {
    throw new Error('Malicious event');
  }
}
