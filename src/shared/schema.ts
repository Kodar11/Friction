import { z } from 'zod';
import { MINUTES_PER_DAY } from './constants.js';

const minuteOfDay = z
  .number()
  .int()
  .min(0)
  .max(MINUTES_PER_DAY - 1);

// Bare hostname: lowercased, no scheme/path/whitespace, no leading dots.
const hostname = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i, 'must be a bare hostname (no scheme, no path)');

const dayOfWeek = z.number().int().min(0).max(6);

export const siteGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  sites: z.array(hostname).max(1000),
});

export const scheduleBlockSchema = z.object({
  id: z.string().min(1),
  startMinute: minuteOfDay,
  endMinute: minuteOfDay,
  days: z.array(dayOfWeek).min(1).max(7),
  siteGroupIds: z.array(z.string().min(1)).min(1),
});

export const preferencesSchema = z.object({
  autoLaunchOnBoot: z.boolean(),
  theme: z.enum(['light', 'dark', 'system']),
  showWelcomeScreen: z.boolean(),
  notificationsEnabled: z.boolean(),
  weeklySummaryEnabled: z.boolean(),
});

export const hardModeLevelSchema = z.enum(['off', 'light', 'medium', 'hard', 'extreme']);

export const hardModeSchema = z.object({
  level: hardModeLevelSchema,
});

export const deactivationEntrySchema = z.object({
  timestamp: z.number().int().nonnegative(),
  hardModeLevel: hardModeLevelSchema,
  reason: z.string().nullable(),
  reactivatedAt: z.number().int().nonnegative().nullable(),
  cancelled: z.boolean().optional(),
});

export const statsStateSchema = z.object({
  currentStreak: z.number().int().nonnegative(),
  longestStreak: z.number().int().nonnegative(),
  lastActiveDate: z.string().nullable(),
  deactivationLog: z.array(deactivationEntrySchema).max(1000),
});

export const blockerConfigSchema = z.object({
  version: z.literal(2),
  active: z.boolean(),
  siteGroups: z.array(siteGroupSchema).max(200),
  scheduleBlocks: z.array(scheduleBlockSchema).max(200),
  preferences: preferencesSchema,
  hardMode: hardModeSchema,
  stats: statsStateSchema,
});

export type ParsedConfig = z.infer<typeof blockerConfigSchema>;

// --- Activity log + .fblock import/export schemas (v2 additions) ---

export const activityEntrySchema = z.object({
  ts: z.number().int().nonnegative(),
  active: z.boolean(),
  blocking: z.array(z.string()),
});

export const fblockFileSchema = z.object({
  format: z.literal('fblock'),
  formatVersion: z.literal(1),
  exportedAt: z.string(),
  siteGroups: z.array(siteGroupSchema),
  scheduleBlocks: z.array(scheduleBlockSchema),
});
