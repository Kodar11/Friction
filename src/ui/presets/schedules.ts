import type { ScheduleBlock, SiteGroup } from '../../shared/types.js';

/**
 * Hardcoded onboarding presets shown on the Welcome screen. Picking one
 * gives the user a working schedule in 30 seconds; they can edit anything
 * from the Site Groups + Schedule pages afterwards.
 *
 * Schedule blocks reference site groups by *name* (not id) so we can
 * generate fresh uuids in `buildFromPreset` without coordination.
 */

export interface PresetGroup {
  name: string;
  sites: string[];
}

export interface PresetBlock {
  startMinute: number;
  endMinute: number;
  /** 0=Sun … 6=Sat. */
  days: number[];
  /** References PresetGroup.name. Resolved to ids by buildFromPreset. */
  siteGroupNames: string[];
}

export interface Preset {
  id: 'student' | 'office' | 'night-shift' | 'blank';
  name: string;
  /** Short pitch shown under the title. */
  description: string;
  siteGroups: PresetGroup[];
  scheduleBlocks: PresetBlock[];
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];

export const PRESETS: Preset[] = [
  {
    id: 'student',
    name: 'Student',
    description:
      'Social blocked through the night and morning, weekday-afternoon focus.',
    siteGroups: [
      {
        name: 'Social',
        sites: ['youtube.com', 'instagram.com', 'x.com', 'tiktok.com', 'reddit.com'],
      },
      {
        name: 'Anime',
        sites: ['animesuge.cz', 'animepahe.pw', 'liquipedia.net'],
      },
    ],
    scheduleBlocks: [
      // Block social 22:00–08:00 every day
      {
        startMinute: 22 * 60,
        endMinute: 8 * 60,
        days: ALL_DAYS,
        siteGroupNames: ['Social'],
      },
      // Block anime 13:00–18:00 weekdays
      {
        startMinute: 13 * 60,
        endMinute: 18 * 60,
        days: WEEKDAYS,
        siteGroupNames: ['Anime'],
      },
    ],
  },
  {
    id: 'office',
    name: 'Office worker',
    description:
      'Distractions blocked through the workday, social through the night.',
    siteGroups: [
      {
        name: 'Social',
        sites: [
          'youtube.com',
          'instagram.com',
          'x.com',
          'linkedin.com',
          'reddit.com',
        ],
      },
      {
        name: 'News',
        sites: [
          'news.ycombinator.com',
          'theverge.com',
          'cnn.com',
          'bbc.com',
        ],
      },
    ],
    scheduleBlocks: [
      // Workday: block both
      {
        startMinute: 9 * 60,
        endMinute: 17 * 60,
        days: WEEKDAYS,
        siteGroupNames: ['Social', 'News'],
      },
      // Late evening / night: social only
      {
        startMinute: 22 * 60,
        endMinute: 7 * 60,
        days: ALL_DAYS,
        siteGroupNames: ['Social'],
      },
    ],
  },
  {
    id: 'night-shift',
    name: 'Night-shift recovery',
    description:
      'Daytime sleep window: social blocked while you should be sleeping.',
    siteGroups: [
      {
        name: 'Social',
        sites: ['youtube.com', 'instagram.com', 'x.com', 'tiktok.com'],
      },
    ],
    scheduleBlocks: [
      // Sleep 06:00–14:00
      {
        startMinute: 6 * 60,
        endMinute: 14 * 60,
        days: ALL_DAYS,
        siteGroupNames: ['Social'],
      },
    ],
  },
  {
    id: 'blank',
    name: 'Start blank',
    description: 'Empty config — build it yourself from scratch.',
    siteGroups: [],
    scheduleBlocks: [],
  },
];

/** Resolve a preset into concrete config-ready arrays with fresh ids and
 *  with siteGroupIds wired up from the named references. */
export function buildFromPreset(preset: Preset): {
  siteGroups: SiteGroup[];
  scheduleBlocks: ScheduleBlock[];
} {
  const groupId = (i: number) =>
    'g_' + Math.random().toString(36).slice(2, 10) + i.toString(36);
  const blockId = (i: number) =>
    'b_' + Math.random().toString(36).slice(2, 10) + i.toString(36);

  const siteGroups: SiteGroup[] = preset.siteGroups.map((g, i) => ({
    id: groupId(i),
    name: g.name,
    sites: [...g.sites],
  }));
  const byName = new Map(siteGroups.map((g) => [g.name, g.id]));

  const scheduleBlocks: ScheduleBlock[] = preset.scheduleBlocks.map((b, i) => ({
    id: blockId(i),
    startMinute: b.startMinute,
    endMinute: b.endMinute,
    days: [...b.days],
    siteGroupIds: b.siteGroupNames
      .map((n) => byName.get(n))
      .filter((x): x is string => !!x),
  }));

  return { siteGroups, scheduleBlocks };
}
