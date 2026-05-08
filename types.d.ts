// Global ambient types for the renderer (window.blocker bridge).
// Service-internal and shared types live in src/shared/types.ts.

interface SiteGroup {
  id: string;
  name: string;
  sites: string[];
}

interface ScheduleBlock {
  id: string;
  startMinute: number;
  endMinute: number;
  siteGroupIds: string[];
}

interface Preferences {
  autoLaunchOnBoot: boolean;
  theme: 'light' | 'dark' | 'system';
  showWelcomeScreen: boolean;
}

interface BlockerConfig {
  version: 1;
  active: boolean;
  siteGroups: SiteGroup[];
  scheduleBlocks: ScheduleBlock[];
  preferences: Preferences;
}

interface BlockerStatus {
  active: boolean;
  serviceRunning: boolean;
  permissionDenied: boolean;
  currentlyBlocking: { groupId: string; groupName: string }[];
  nextChange: { atMinute: number; willBlock: string[] } | null;
  lastError: string | null;
  lastFlushedAt: number | null;
}

interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  source: 'app' | 'service';
  message: string;
}

type FrameWindowAction = 'CLOSE' | 'MAXIMIZE' | 'MINIMIZE';

interface ServiceState {
  installed: boolean;
  running: boolean;
}

interface AdminState {
  isAdmin: boolean;
}

type EventPayloadMapping = {
  getConfig: BlockerConfig;
  saveConfig: { ok: boolean; error?: string };
  getStatus: BlockerStatus;
  activate: { ok: boolean };
  deactivate: { ok: boolean };
  restoreHostsFile: { ok: boolean };
  setAutoLaunch: void;
  openLogFolder: void;
  getLogs: LogEntry[];
  getAdminState: AdminState;
  relaunchAsAdmin: { ok: boolean; error?: string };
  flushDnsNow: { ok: boolean; error?: string };
  openBrowserDnsPage: { ok: boolean; error?: string };
  getServiceState: ServiceState;
  installService: { ok: boolean; error?: string };
  uninstallService: { ok: boolean; error?: string };
  'status-changed': BlockerStatus;
  'config-changed': BlockerConfig;
  'service-error': { message: string; timestamp: number };
  sendFrameAction: FrameWindowAction;
};

type UnsubscribeFunction = () => void;

interface Window {
  blocker: {
    getConfig: () => Promise<BlockerConfig>;
    saveConfig: (config: BlockerConfig) => Promise<{ ok: boolean; error?: string }>;
    getStatus: () => Promise<BlockerStatus>;
    activate: () => Promise<{ ok: boolean }>;
    deactivate: () => Promise<{ ok: boolean }>;
    restoreHostsFile: () => Promise<{ ok: boolean }>;
    openLogFolder: () => Promise<void>;
    getLogs: (limit: number) => Promise<LogEntry[]>;
    setAutoLaunch: (enabled: boolean) => Promise<void>;
    getAdminState: () => Promise<AdminState>;
    relaunchAsAdmin: () => Promise<{ ok: boolean; error?: string }>;
    flushDnsNow: () => Promise<{ ok: boolean; error?: string }>;
    openBrowserDnsPage: () => Promise<{ ok: boolean; error?: string }>;
    getServiceState: () => Promise<ServiceState>;
    installService: () => Promise<{ ok: boolean; error?: string }>;
    uninstallService: () => Promise<{ ok: boolean; error?: string }>;
    onStatusChanged: (cb: (status: BlockerStatus) => void) => UnsubscribeFunction;
    onConfigChanged: (cb: (config: BlockerConfig) => void) => UnsubscribeFunction;
    onServiceError: (cb: (err: { message: string; timestamp: number }) => void) => UnsubscribeFunction;
    sendFrameAction: (payload: FrameWindowAction) => void;
  };
}
