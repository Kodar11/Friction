import { useMemo, useState } from 'react';

interface Props {
  cells: HeatmapCell[]; // oldest first, exactly 90 days
}

/**
 * GitHub-style 13-week × 7-day heatmap, sized to fit the Stats card.
 *
 * Data shape: an array of `{ date, intensity }` cells, oldest first.
 * Layout: cells flow column-major — week-by-week from left to right, with
 * Sunday at the top of each column. We pad the leading column so the first
 * day in the grid lines up with its real day-of-week.
 *
 * Intensity buckets 0..4 map to a five-stop ramp; we use the accent variable
 * for the hot end so it adapts to theme.
 */
export function Heatmap({ cells }: Props) {
  const [hover, setHover] = useState<HeatmapCell | null>(null);

  // Build a column-major matrix. Pad the first week so day-of-week lines up.
  const { columns, monthLabels } = useMemo(() => buildMatrix(cells), [cells]);

  return (
    <div className="select-none">
      <div className="flex items-end gap-2">
        {/* Day labels on the left (Mon/Wed/Fri) */}
        <div className="flex flex-col gap-[3px] pr-1 text-[10px] text-faint" style={{ height: 7 * 14 + 6 * 3 }}>
          {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((label, i) => (
            <div
              key={i}
              className="h-[14px] grid items-center"
              style={{ visibility: label ? 'visible' : 'hidden' }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex flex-col gap-1">
          <div
            className="grid gap-[3px] text-[10px] text-faint relative"
            style={{ gridTemplateColumns: `repeat(${columns.length}, 14px)` }}
          >
            {monthLabels.map((m, i) => (
              <div
                key={i}
                className="absolute"
                style={{
                  left: i * (14 + 3),
                  top: -16,
                  width: m.span * (14 + 3),
                  visibility: m.label ? 'visible' : 'hidden',
                }}
              >
                {m.label}
              </div>
            ))}
          </div>

          <div
            className="grid gap-[3px]"
            style={{ gridTemplateColumns: `repeat(${columns.length}, 14px)` }}
          >
            {columns.map((col, ci) => (
              <div key={ci} className="grid gap-[3px]" style={{ gridTemplateRows: 'repeat(7, 14px)' }}>
                {col.map((cell, ri) =>
                  cell ? (
                    <div
                      key={ri}
                      onMouseEnter={() => setHover(cell)}
                      onMouseLeave={() => setHover(null)}
                      className="h-[14px] w-[14px] rounded-[3px] transition-[opacity]"
                      style={{
                        background: bucketColor(cell.intensity),
                        outline: '1px solid var(--border)',
                        outlineOffset: -1,
                      }}
                      title={`${cell.date} · ${labelFor(cell.intensity)}`}
                    />
                  ) : (
                    <div key={ri} className="h-[14px] w-[14px]" />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-[10.5px] text-faint">
        {hover ? (
          <span className="tabular-nums">
            {formatDate(hover.date)} — {labelFor(hover.intensity)}
          </span>
        ) : (
          <span>Last 90 days</span>
        )}
        <div className="flex-1" />
        <span>Less</span>
        <div className="flex gap-[3px]">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-[10px] w-[10px] rounded-[2px]"
              style={{ background: bucketColor(i as 0 | 1 | 2 | 3 | 4), outline: '1px solid var(--border)', outlineOffset: -1 }}
            />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}

function bucketColor(level: 0 | 1 | 2 | 3 | 4): string {
  if (level === 0) return 'var(--bg-secondary)';
  // Build a soft → vivid ramp using accent at varying alphas. Alpha lets us
  // adapt to either theme without hard-coding light/dark colors.
  const alpha = [0, 0.18, 0.4, 0.65, 0.9][level];
  // Use rgba on the accent — pulled via getComputedStyle would be ideal, but
  // the CSS variable is already accent-coloured. Fallback to a fixed accent
  // matching the design system.
  return `color-mix(in oklab, var(--accent) ${Math.round(alpha * 100)}%, var(--bg-secondary))`;
}

function labelFor(level: 0 | 1 | 2 | 3 | 4): string {
  switch (level) {
    case 0: return 'no scheduled focus or no adherence';
    case 1: return 'partial — under 25%';
    case 2: return 'partial — 25–50%';
    case 3: return 'partial — 50–80%';
    case 4: return 'fully kept';
  }
}

function formatDate(iso: string): string {
  // iso = YYYY-MM-DD
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

interface MonthLabel { label: string; span: number }

function buildMatrix(cells: HeatmapCell[]): {
  columns: (HeatmapCell | null)[][];
  monthLabels: MonthLabel[];
} {
  if (cells.length === 0) {
    return { columns: [], monthLabels: [] };
  }

  // Day-of-week of first cell determines leading padding.
  const first = parseISO(cells[0].date);
  const leadingPad = first.getDay(); // Sunday=0 fits row 0

  // Build a flat list of (cell-or-null) where index 0 = oldest pad.
  const flat: (HeatmapCell | null)[] = [];
  for (let i = 0; i < leadingPad; i++) flat.push(null);
  for (const c of cells) flat.push(c);

  // Pack into columns of 7.
  const columns: (HeatmapCell | null)[][] = [];
  for (let i = 0; i < flat.length; i += 7) {
    columns.push(flat.slice(i, i + 7));
  }
  // Pad the trailing column to 7.
  if (columns.length > 0) {
    const last = columns[columns.length - 1];
    while (last.length < 7) last.push(null);
  }

  // Month labels — show the month name on the column where the month changes.
  const monthLabels: MonthLabel[] = [];
  let prevMonth = -1;
  let curr: MonthLabel | null = null;
  for (let ci = 0; ci < columns.length; ci++) {
    // Pick a non-null cell in this column
    const cell = columns[ci].find((c) => c !== null) ?? null;
    if (!cell) {
      monthLabels.push({ label: '', span: 1 });
      continue;
    }
    const d = parseISO(cell.date);
    const m = d.getMonth();
    if (m !== prevMonth) {
      if (curr) monthLabels.push(curr);
      curr = { label: d.toLocaleDateString(undefined, { month: 'short' }), span: 1 };
      prevMonth = m;
    } else {
      if (curr) curr.span += 1;
      monthLabels.push({ label: '', span: 1 });
      continue;
    }
    monthLabels.push({ label: '', span: 1 });
  }
  // Replace the placeholder labels at the start of each month run.
  // Walk again to insert labels at run-start indices.
  const result: MonthLabel[] = [];
  let lastLabel = '';
  for (let ci = 0; ci < columns.length; ci++) {
    const cell = columns[ci].find((c) => c !== null) ?? null;
    if (!cell) {
      result.push({ label: '', span: 1 });
      continue;
    }
    const monthName = parseISO(cell.date).toLocaleDateString(undefined, { month: 'short' });
    if (monthName !== lastLabel) {
      result.push({ label: monthName, span: 1 });
      lastLabel = monthName;
    } else {
      result.push({ label: '', span: 1 });
    }
  }

  return { columns, monthLabels: result };
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d);
}
