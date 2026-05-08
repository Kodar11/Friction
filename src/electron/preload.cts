const electron = require('electron');

electron.contextBridge.exposeInMainWorld('blocker', {
  getConfig: () => ipcInvoke('getConfig'),
  saveConfig: (config: BlockerConfig) => ipcInvokeWith('saveConfig', config),
  getStatus: () => ipcInvoke('getStatus'),
  activate: () => ipcInvoke('activate'),
  deactivate: () => ipcInvoke('deactivate'),
  restoreHostsFile: () => ipcInvoke('restoreHostsFile'),
  openLogFolder: () => ipcInvoke('openLogFolder'),
  getLogs: (limit: number) => ipcInvokeWith('getLogs', limit),
  setAutoLaunch: (enabled: boolean) => ipcInvokeWith('setAutoLaunch', enabled),
  getAdminState: () => ipcInvoke('getAdminState'),
  relaunchAsAdmin: () => ipcInvoke('relaunchAsAdmin'),
  flushDnsNow: () => ipcInvoke('flushDnsNow'),
  openBrowserDnsPage: () => ipcInvoke('openBrowserDnsPage'),
  getServiceState: () => ipcInvoke('getServiceState'),
  installService: () => ipcInvoke('installService'),
  uninstallService: () => ipcInvoke('uninstallService'),
  onStatusChanged: (cb: (status: BlockerStatus) => void) =>
    ipcOn('status-changed', cb),
  onConfigChanged: (cb: (config: BlockerConfig) => void) =>
    ipcOn('config-changed', cb),
  onServiceError: (cb: (err: { message: string; timestamp: number }) => void) =>
    ipcOn('service-error', cb),
  sendFrameAction: (payload: FrameWindowAction) => ipcSend('sendFrameAction', payload),
} satisfies Window['blocker']);

function ipcInvoke<Key extends keyof EventPayloadMapping>(
  key: Key,
): Promise<EventPayloadMapping[Key]> {
  return electron.ipcRenderer.invoke(key);
}

function ipcInvokeWith<Key extends keyof EventPayloadMapping>(
  key: Key,
  payload: unknown,
): Promise<EventPayloadMapping[Key]> {
  return electron.ipcRenderer.invoke(key, payload);
}

function ipcOn<Key extends keyof EventPayloadMapping>(
  key: Key,
  callback: (payload: EventPayloadMapping[Key]) => void,
) {
  const cb = (_: unknown, payload: any) => callback(payload);
  electron.ipcRenderer.on(key, cb);
  return () => electron.ipcRenderer.off(key, cb);
}

function ipcSend<Key extends keyof EventPayloadMapping>(
  key: Key,
  payload: EventPayloadMapping[Key],
) {
  electron.ipcRenderer.send(key, payload);
}
