import type { BlockerConfig, BlockerConfigV1 } from './types.js';

/**
 * Migrate any historical config shape forward to the current v2 shape.
 *
 * Pure: takes raw JSON (already parsed), returns a v2 config + a flag for
 * whether anything changed. Caller is responsible for writing a `.v1.bak`
 * backup before persisting the migrated config.
 *
 * Tolerant by design — partial / hand-edited configs still produce a sane v2
 * by filling defaults for any missing v2-only fields.
 */
export function migrateConfig(raw: unknown): { config: BlockerConfig; migrated: boolean; from: number } {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Config is not an object.');
  }
  const v = (raw as { version?: unknown }).version;

  if (v === 2) {
    return { config: raw as BlockerConfig, migrated: false, from: 2 };
  }

  if (v === 1 || v === undefined) {
    const migrated = v1ToV2(raw as Partial<BlockerConfigV1>);
    return { config: migrated, migrated: true, from: typeof v === 'number' ? v : 1 };
  }

  throw new Error(`Unsupported config version: ${v}.`);
}

function v1ToV2(input: Partial<BlockerConfigV1>): BlockerConfig {
  const allDays = [0, 1, 2, 3, 4, 5, 6];

  return {
    version: 2,
    active: !!input.active,
    siteGroups: input.siteGroups ?? [],
    scheduleBlocks: (input.scheduleBlocks ?? []).map((b) => ({
      id: b.id,
      startMinute: b.startMinute,
      endMinute: b.endMinute,
      // Per the plan: pre-v2 blocks are filled with all-week so behaviour
      // is preserved exactly.
      days: Array.isArray(b.days) && b.days.length > 0 ? [...b.days] : allDays,
      siteGroupIds: b.siteGroupIds,
    })),
    preferences: {
      autoLaunchOnBoot: !!input.preferences?.autoLaunchOnBoot,
      theme: input.preferences?.theme ?? 'system',
      showWelcomeScreen: input.preferences?.showWelcomeScreen ?? false,
      // v2 additions — opt-in by default since they're useful and easily
      // disabled.
      notificationsEnabled: true,
      weeklySummaryEnabled: true,
    },
    hardMode: { level: 'light' },
    stats: {
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      deactivationLog: [],
    },
  };
}
