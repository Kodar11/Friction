import { z } from 'zod';
import { MINUTES_PER_DAY } from './constants.js';

const minuteOfDay = z
  .number()
  .int()
  .min(0)
  .max(MINUTES_PER_DAY - 1);

// A site is a bare hostname. We disallow schemes, paths, and whitespace; we
// also disallow leading dots. Length cap is generous but bounded.
const hostname = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i, 'must be a bare hostname (no scheme, no path)');

export const siteGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  sites: z.array(hostname).max(1000),
});

export const scheduleBlockSchema = z.object({
  id: z.string().min(1),
  startMinute: minuteOfDay,
  endMinute: minuteOfDay,
  siteGroupIds: z.array(z.string().min(1)).min(1),
});

export const preferencesSchema = z.object({
  autoLaunchOnBoot: z.boolean(),
  theme: z.enum(['light', 'dark', 'system']),
  showWelcomeScreen: z.boolean(),
});

export const blockerConfigSchema = z.object({
  version: z.literal(1),
  active: z.boolean(),
  siteGroups: z.array(siteGroupSchema).max(200),
  scheduleBlocks: z.array(scheduleBlockSchema).max(200),
  preferences: preferencesSchema,
});

export type ParsedConfig = z.infer<typeof blockerConfigSchema>;
