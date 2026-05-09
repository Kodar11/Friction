// Shared, runtime-importable types. Mirror the ambient declarations in
// /types.d.ts (those are for the renderer global; these are for module-graph
// consumers).

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
  /** Days of the week this block applies on. 0 = Sunday … 6 = Saturday.
   *  Default is all 7 days (every day). v1 configs are migrated to fill this. */
  days: number[];
  siteGroupIds: string[];
}

export type HardModeLevel = 'off' | 'light' | 'medium' | 'hard' | 'extreme';

export interface HardModeSettings {
  level: HardModeLevel;
}

export interface DeactivationEntry {
  /** Unix ms when the user *successfully* deactivated. */
  timestamp: number;
  hardModeLevel: HardModeLevel;
  /** Free-form reason. Required at hard / extreme; null for light / off. */
  reason: string | null;
  /** Unix ms when blocking was re-activated, or null if still off. */
  reactivatedAt: number | null;
  /** True if the user started the deactivation flow but cancelled it. */
  cancelled?: boolean;
}

export interface StatsState {
  currentStreak: number;
  longestStreak: number;
  /** ISO date (YYYY-MM-DD) of the most recent day that "counted" toward the streak. */
  lastActiveDate: string | null;
  /** Newest first. Capped at 1000 entries, oldest dropped. */
  deactivationLog: DeactivationEntry[];
}

export interface Preferences {
  autoLaunchOnBoot: boolean;
  theme: 'light' | 'dark' | 'system';
  showWelcomeScreen: boolean;
  /** Master toggle for the upcoming-change notifications. */
  notificationsEnabled: boolean;
  /** Sunday-evening summary notification. */
  weeklySummaryEnabled: boolean;
}

export interface BlockerConfig {
  version: 2;
  active: boolean;
  siteGroups: SiteGroup[];
  scheduleBlocks: ScheduleBlock[];
  preferences: Preferences;
  hardMode: HardModeSettings;
  stats: StatsState;
}

/** Minimal v1 shape we still need to recognise during migration. Fields
 *  not listed here are passed through unchanged where possible. */
export interface BlockerConfigV1 {
  version: 1;
  active: boolean;
  siteGroups: SiteGroup[];
  scheduleBlocks: Array<{
    id: string;
    startMinute: number;
    endMinute: number;
    siteGroupIds: string[];
    /** Pre-v2 configs may not have this. */
    days?: number[];
  }>;
  preferences: {
    autoLaunchOnBoot: boolean;
    theme: 'light' | 'dark' | 'system';
    showWelcomeScreen: boolean;
  };
}

export interface BlockerStatus {
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
  /** Next minute-of-day at which the active set changes, or null if static.
   *  Note: this only covers same-day boundaries; cross-day transitions are
   *  caught by the 60s scheduler tick. */
  nextChangeAtMinute: number | null;
}

/** A line written to activity.jsonl whenever the runtime's blocking state
 *  changes. Append-only; the stats engine reads back to compute streaks etc. */
export interface ActivityEntry {
  /** Unix ms. */
  ts: number;
  /** True if the user has master-toggled blocking on (config.active). */
  active: boolean;
  /** Group names currently being enforced; empty when not in a window. */
  blocking: string[];
}
