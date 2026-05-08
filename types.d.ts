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
  currentlyBlocking: { groupId: string; groupName: string }[];
  nextChange: { atMinute: number; willBlock: string[] } | null;
  lastError: string | null;
}

interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  source: 'app' | 'service';
  message: string;
}

type FrameWindowAction = 'CLOSE' | 'MAXIMIZE' | 'MINIMIZE';

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
    onStatusChanged: (cb: (status: BlockerStatus) => void) => UnsubscribeFunction;
    onConfigChanged: (cb: (config: BlockerConfig) => void) => UnsubscribeFunction;
    onServiceError: (cb: (err: { message: string; timestamp: number }) => void) => UnsubscribeFunction;
    sendFrameAction: (payload: FrameWindowAction) => void;
  };
}
