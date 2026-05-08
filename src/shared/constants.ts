export const APP_ID = 'focus-blocker';
export const SERVICE_NAME = 'FocusBlockerService';

export const HOSTS_BEGIN = '# === focus-blocker BEGIN === DO NOT EDIT';
export const HOSTS_END = '# === focus-blocker END ===';
export const REDIRECT_IP = '127.0.0.1';

export const SCHEDULE_TICK_MS = 60_000;
export const CONFIG_FILENAME = 'config.json';
export const STATUS_FILENAME = 'status.json';
export const LOG_FILENAME = 'focus-blocker.log';

/** A status file written more recently than this is considered "live". */
export const HEARTBEAT_FRESHNESS_MS = 2.5 * 60_000;

export const MINUTES_PER_DAY = 24 * 60;

/** Default config used on first install. IDs are passed in so the caller
 *  controls UUID generation (keeps this module dependency-free). */
export function defaultConfig(socialId: string, blockId: string): import('./types.js').BlockerConfig {
  return {
    version: 1,
    active: false,
    siteGroups: [
      {
        id: socialId,
        name: 'Social',
        sites: ['youtube.com', 'instagram.com', 'x.com'],
      },
    ],
    scheduleBlocks: [
      {
        id: blockId,
        startMinute: 22 * 60,
        endMinute: 8 * 60,
        siteGroupIds: [socialId],
      },
    ],
    preferences: {
      autoLaunchOnBoot: false,
      theme: 'system',
      showWelcomeScreen: true,
    },
  };
}
