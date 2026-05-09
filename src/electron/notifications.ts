import { Notification } from 'electron';

/**
 * Thin wrapper around Electron's Notification API.
 *
 * On Windows 10/11 this surfaces a toast in the system Action Center. We
 * keep a single show() entry so the rest of main can fire-and-forget without
 * worrying about platform support or import ordering.
 *
 * Notifications never throw — best-effort. If the OS refuses (no permission,
 * Focus Assist, etc.) it's silent.
 */

export interface ShowOpts {
  title: string;
  body: string;
  /** Identifier so the renderer can correlate clicks/dismissals across kinds. */
  tag?: string;
  silent?: boolean;
  onClick?: () => void;
}

export function notifySupported(): boolean {
  try {
    return Notification.isSupported();
  } catch {
    return false;
  }
}

export function showNotification(opts: ShowOpts): void {
  if (!notifySupported()) return;
  try {
    const n = new Notification({
      title: opts.title,
      body: opts.body,
      silent: !!opts.silent,
    });
    if (opts.onClick) n.on('click', opts.onClick);
    n.show();
  } catch {
    // swallow — notifications must never crash the host process.
  }
}
