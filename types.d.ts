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
  /** Days of the week, 0=Sun … 6=Sat. v1 migration fills this with [0..6]. */
  days: number[];
  siteGroupIds: string[];
}

type HardModeLevel = 'off' | 'light' | 'medium' | 'hard' | 'extreme';

interface HardModeSettings {
  level: HardModeLevel;
}

interface DeactivationEntry {
  timestamp: number;
  hardModeLevel: HardModeLevel;
  reason: string | null;
  reactivatedAt: number | null;
  cancelled?: boolean;
}

interface StatsState {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  deactivationLog: DeactivationEntry[];
}

interface Preferences {
  autoLaunchOnBoot: boolean;
  theme: 'light' | 'dark' | 'system';
  showWelcomeScreen: boolean;
  notificationsEnabled: boolean;
  weeklySummaryEnabled: boolean;
}

interface BlockerConfig {
  version: 2;
  active: boolean;
  siteGroups: SiteGroup[];
  scheduleBlocks: ScheduleBlock[];
  preferences: Preferences;
  hardMode: HardModeSettings;
  stats: StatsState;
}

interface BlockerStatus {
  active: boolean;
  serviceRunning: boolean;
  serviceOutOfDate: boolean;
  serviceVersion: string | null;
  appVersion: string;
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

interface ActivityEntry {
  ts: number;
  active: boolean;
  blocking: string[];
}

interface HeatmapCell {
  date: string; // YYYY-MM-DD
  intensity: 0 | 1 | 2 | 3 | 4;
}

interface StatsBundle {
  streak: { current: number; longest: number; lastActiveDate: string | null };
  timeSaved: { week: number; month: number; allTime: number }; // minutes
  adherence: { week: number; month: number }; // 0-100
  heatmap: HeatmapCell[]; // newest day last
}

interface FblockPreview {
  siteGroups: SiteGroup[];
  scheduleBlocks: ScheduleBlock[];
  exportedAt: string;
  /** Filename the user picked, for display only. */
  filename: string;
}

type FrameWindowAction = 'CLOSE' | 'MAXIMIZE' | 'MINIMIZE';

interface ServiceState {
  installed: boolean;
  running: boolean;
}

interface AdminState {
  isAdmin: boolean;
}

interface DeactivateRequestResponse {
  result: 'allowed' | 'needs-confirm' | 'needs-phrase' | 'needs-countdown' | 'blocked';
  level: HardModeLevel;
  countdownMs?: number;
  requiredPhrase?: string;
}

type EventPayloadMapping = {
  getConfig: BlockerConfig;
  saveConfig: { ok: boolean; error?: string };
  getStatus: BlockerStatus;
  activate: { ok: boolean };
  /** Legacy: bypass Hard Mode entirely. Reserved for internal flows. */
  deactivate: { ok: boolean };
  /** Hard-Mode-aware: ask main what flow to run. */
  requestDeactivate: DeactivateRequestResponse;
  /** Renderer calls this once the friction is satisfied. */
  completeDeactivate: { ok: boolean };
  /** Renderer calls this if the user backs out of the friction flow. */
  cancelDeactivate: { ok: boolean };
  setHardMode: { ok: boolean };
  getDeactivationLog: DeactivationEntry[];
  getStats: StatsBundle;
  exportSchedule: { ok: boolean; path?: string; cancelled?: boolean; error?: string };
  importSchedule: { ok: boolean; preview?: FblockPreview; cancelled?: boolean; error?: string };
  applyImportedSchedule: { ok: boolean; error?: string };
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
    /** Reserved/internal — bypasses Hard Mode. Most UI should use requestDeactivate. */
    deactivate: () => Promise<{ ok: boolean }>;
    requestDeactivate: () => Promise<DeactivateRequestResponse>;
    completeDeactivate: (payload: { reason: string | null }) => Promise<{ ok: boolean }>;
    cancelDeactivate: (payload: { reason: string | null }) => Promise<{ ok: boolean }>;
    setHardMode: (level: HardModeLevel) => Promise<{ ok: boolean }>;
    getDeactivationLog: () => Promise<DeactivationEntry[]>;
    getStats: () => Promise<StatsBundle>;
    exportSchedule: () => Promise<{ ok: boolean; path?: string; cancelled?: boolean; error?: string }>;
    importSchedule: () => Promise<{ ok: boolean; preview?: FblockPreview; cancelled?: boolean; error?: string }>;
    applyImportedSchedule: (preview: FblockPreview) => Promise<{ ok: boolean; error?: string }>;
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
