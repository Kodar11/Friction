// Shared, runtime-importable types. Mirror the ambient declarations in /types.d.ts
// (those are for the renderer global; these are for module-graph consumers).

export interface SiteGroup {
  id: string;
  name: string;
  sites: string[];
}

export interface ScheduleBlock {
  id: string;
  /** Minutes since midnight, 0-1439. */
  startMinute: number;
  /** Minutes since midnight, 0-1439. May be < startMinute (wraps midnight). */
  endMinute: number;
  siteGroupIds: string[];
}

export interface Preferences {
  autoLaunchOnBoot: boolean;
  theme: 'light' | 'dark' | 'system';
  showWelcomeScreen: boolean;
}

export interface BlockerConfig {
  version: 1;
  active: boolean;
  siteGroups: SiteGroup[];
  scheduleBlocks: ScheduleBlock[];
  preferences: Preferences;
}

export interface BlockerStatus {
  active: boolean;
  serviceRunning: boolean;
  /** True when the runtime tried to write the hosts file and was denied
   *  (EPERM/EACCES). Drives the "needs admin / install service" UI banner. */
  permissionDenied: boolean;
  currentlyBlocking: { groupId: string; groupName: string }[];
  nextChange: { atMinute: number; willBlock: string[] } | null;
  lastError: string | null;
  /** Wall-clock ms of the last successful DNS flush, or null. */
  lastFlushedAt: number | null;
}

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  source: 'app' | 'service';
  message: string;
}

export interface ScheduleEvaluation {
  /** Unique sites to block right now (after variant expansion is applied downstream). */
  sites: string[];
  /** Which groups contributed sites at this moment. */
  activeGroups: { groupId: string; groupName: string }[];
  /** Next minute-of-day at which the active set changes, or null if static. */
  nextChangeAtMinute: number | null;
}
