import { describe, expect, it } from 'vitest';
import { migrateConfig } from '../../src/shared/migration.js';
import { blockerConfigSchema } from '../../src/shared/schema.js';
import type { BlockerConfigV1 } from '../../src/shared/types.js';

const v1: BlockerConfigV1 = {
  version: 1,
  active: false,
  siteGroups: [
    { id: 'social', name: 'Social', sites: ['youtube.com', 'instagram.com'] },
  ],
  scheduleBlocks: [
    { id: 'b1', startMinute: 22 * 60, endMinute: 8 * 60, siteGroupIds: ['social'] },
  ],
  preferences: {
    autoLaunchOnBoot: false,
    theme: 'system',
    showWelcomeScreen: false,
  },
};

describe('migrateConfig: v1 → v2', () => {
  it('reports migrated=true for v1 input', () => {
    const r = migrateConfig(v1);
    expect(r.migrated).toBe(true);
    expect(r.from).toBe(1);
    expect(r.config.version).toBe(2);
  });

  it('fills days[] with all 7 days on each schedule block', () => {
    const r = migrateConfig(v1);
    expect(r.config.scheduleBlocks[0].days).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('preserves existing schedule + group data', () => {
    const r = migrateConfig(v1);
    expect(r.config.siteGroups).toEqual(v1.siteGroups);
    expect(r.config.scheduleBlocks[0].id).toBe('b1');
    expect(r.config.scheduleBlocks[0].startMinute).toBe(22 * 60);
    expect(r.config.scheduleBlocks[0].endMinute).toBe(8 * 60);
    expect(r.config.scheduleBlocks[0].siteGroupIds).toEqual(['social']);
  });

  it('adds default hardMode.light + empty stats', () => {
    const r = migrateConfig(v1);
    expect(r.config.hardMode.level).toBe('light');
    expect(r.config.stats.currentStreak).toBe(0);
    expect(r.config.stats.longestStreak).toBe(0);
    expect(r.config.stats.lastActiveDate).toBeNull();
    expect(r.config.stats.deactivationLog).toEqual([]);
  });

  it('opts users into notifications + weekly summary by default', () => {
    const r = migrateConfig(v1);
    expect(r.config.preferences.notificationsEnabled).toBe(true);
    expect(r.config.preferences.weeklySummaryEnabled).toBe(true);
  });

  it('output passes the v2 Zod schema', () => {
    const r = migrateConfig(v1);
    expect(() => blockerConfigSchema.parse(r.config)).not.toThrow();
  });

  it('is a no-op for an already-v2 config', () => {
    const v2 = migrateConfig(v1).config;
    const second = migrateConfig(v2);
    expect(second.migrated).toBe(false);
    expect(second.config).toEqual(v2);
  });

  it('preserves user-set days[] when present in v1 input', () => {
    const v1WithDays: any = {
      ...v1,
      scheduleBlocks: [
        { id: 'b1', startMinute: 540, endMinute: 720, siteGroupIds: ['social'], days: [1, 3, 5] },
      ],
    };
    const r = migrateConfig(v1WithDays);
    expect(r.config.scheduleBlocks[0].days).toEqual([1, 3, 5]);
  });

  it('rejects non-objects', () => {
    expect(() => migrateConfig(null)).toThrow();
    expect(() => migrateConfig('hello')).toThrow();
    expect(() => migrateConfig(42)).toThrow();
  });

  it('rejects unsupported version', () => {
    expect(() => migrateConfig({ version: 99 })).toThrow(/Unsupported/);
  });
});
