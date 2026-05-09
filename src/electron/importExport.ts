import { dialog, BrowserWindow } from 'electron';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fblockFileSchema } from '../shared/schema.js';
import type { BlockerConfig, ScheduleBlock, SiteGroup } from '../shared/types.js';

/**
 * .fblock import / export — JSON envelope + a subset of config.json
 * (`siteGroups` + `scheduleBlocks`). Stats and Hard Mode settings are
 * deliberately excluded — those are personal, not shareable.
 *
 * Both flows go through native file dialogs in the main process; the
 * renderer just kicks them off and renders a preview before applying.
 */

const ENVELOPE = {
  format: 'fblock' as const,
  formatVersion: 1 as const,
};

export interface FblockPreview {
  siteGroups: SiteGroup[];
  scheduleBlocks: ScheduleBlock[];
  exportedAt: string;
  filename: string;
}

export interface ExportResult {
  ok: boolean;
  path?: string;
  cancelled?: boolean;
  error?: string;
}

export interface ImportResult {
  ok: boolean;
  preview?: FblockPreview;
  cancelled?: boolean;
  error?: string;
}

/** Show a save dialog and write the current config's schedule to .fblock. */
export async function exportToFile(
  config: BlockerConfig,
  parent: BrowserWindow | null,
): Promise<ExportResult> {
  try {
    const opts: Electron.SaveDialogOptions = {
      title: 'Export schedule',
      defaultPath: defaultExportName(),
      filters: [
        { name: 'Focus Blocker schedule', extensions: ['fblock'] },
        { name: 'JSON', extensions: ['json'] },
      ],
    };
    const result = parent
      ? await dialog.showSaveDialog(parent, opts)
      : await dialog.showSaveDialog(opts);
    if (result.canceled || !result.filePath) return { ok: false, cancelled: true };

    const body = JSON.stringify(
      {
        ...ENVELOPE,
        exportedAt: new Date().toISOString(),
        siteGroups: config.siteGroups,
        scheduleBlocks: config.scheduleBlocks,
      },
      null,
      2,
    ) + '\n';

    await fsp.writeFile(result.filePath, body, 'utf8');
    return { ok: true, path: result.filePath };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/** Show an open dialog, parse + validate the chosen file, return a preview
 *  for the renderer to confirm. Does NOT persist. */
export async function importFromFile(parent: BrowserWindow | null): Promise<ImportResult> {
  try {
    const opts: Electron.OpenDialogOptions = {
      title: 'Import schedule',
      filters: [
        { name: 'Focus Blocker schedule', extensions: ['fblock'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'All files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, opts)
      : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) return { ok: false, cancelled: true };

    const filePath = result.filePaths[0];
    const raw = await fsp.readFile(filePath, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: "That file isn't valid JSON." };
    }

    const validated = fblockFileSchema.safeParse(parsed);
    if (!validated.success) {
      return {
        ok: false,
        error: humanZodError(validated.error.issues),
      };
    }

    return {
      ok: true,
      preview: {
        siteGroups: validated.data.siteGroups,
        scheduleBlocks: validated.data.scheduleBlocks,
        exportedAt: validated.data.exportedAt,
        filename: path.basename(filePath),
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

function defaultExportName(): string {
  const d = new Date();
  const yyyy = d.getFullYear().toString().padStart(4, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `focus-blocker-${yyyy}-${mm}-${dd}.fblock`;
}

function humanZodError(issues: { path: (string | number)[]; message: string }[]): string {
  if (issues.length === 0) return 'Schedule file failed validation.';
  const first = issues[0];
  const where = first.path.length > 0 ? first.path.join('.') : '(root)';
  return `Schedule file failed validation at ${where}: ${first.message}`;
}
