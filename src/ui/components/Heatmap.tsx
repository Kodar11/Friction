import { useMemo, useState } from 'react';

interface Props {
  cells: HeatmapCell[]; // oldest first, up to 365 days
}

const GAP = 3;
const SIZE = 11;

/**
 * GitHub Contributions-style heatmap.
 *
 * - Full year (365 days)
 * - Column-major: each column is one week (Sun→Sat)
 * - Day labels on left: Mon, Wed, Fri only
 * - Month labels above the first column of each month
 * - Horizontal scroll with native scrollbar (overflow-x-auto)
 */
export function Heatmap({ cells }: Props) {
  const [hover, setHover] = useState<HeatmapCell | null>(null);

  const { columns, monthLabels } = useMemo(() => buildMatrix(cells), [cells]);

  if (columns.length === 0) {
    return (
      <div className="text-[12px] text-muted py-4">
        Not enough data yet.
      </div>
    );
  }

  const colWidth = SIZE + GAP;
  const gridWidth = columns.length * colWidth - GAP;

  return (
    <div className="select-none">
      {/* Scrollable area */}
      <div className="overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
        <div className="inline-block min-w-full">
          {/* Month label row */}
          <div className="flex" style={{ paddingLeft: 30 }}>
            {monthLabels.map((m, i) => (
              <div
                key={i}
                className="text-[10px] text-faint whitespace-nowrap"
                style={{
                  width: colWidth,
                  visibility: m.label ? 'visible' : 'hidden',
                }}
              >
                {m.label}
              </div>
            ))}
          </div>

          {/* Grid + day labels */}
          <div className="flex gap-1">
            {/* Day labels */}
            <div className="flex flex-col text-[10px] text-faint pr-1" style={{ width: 28 }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                <div
                  key={day}
                  className="flex items-center"
                  style={{ height: SIZE, visibility: [1, 3, 5].includes(i) ? 'visible' : 'hidden' }}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Cell grid */}
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${columns.length}, ${SIZE}px)`,
                gridTemplateRows: `repeat(7, ${SIZE}px)`,
                gap: GAP,
                width: gridWidth,
              }}
            >
              {columns.map((col, ci) =>
                col.map((cell, ri) => {
                  const key = `${ci}-${ri}`;
                  if (!cell) {
                    return <div key={key} style={{ width: SIZE, height: SIZE }} />;
                  }
                  return (
                    <div
                      key={key}
                      onMouseEnter={() => setHover(cell)}
                      onMouseLeave={() => setHover(null)}
                      className="rounded-[2px] transition-opacity"
                      style={{
                        width: SIZE,
                        height: SIZE,
                        background: bucketColor(cell.intensity),
                        outline: '1px solid var(--heatmap-border)',
                        outlineOffset: -1,
                      }}
                      title={`${cell.date} · ${labelFor(cell.intensity)}`}
                    />
                  );
                }),
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-2 flex items-center gap-3 text-[10.5px] text-faint">
        {hover ? (
          <span className="tabular-nums">
            {formatDate(hover.date)} — {labelFor(hover.intensity)}
          </span>
        ) : (
          <span>Last year</span>
        )}
        <div className="flex-1" />
        <span>Less</span>
        <div className="flex gap-[3px]">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-[2px]"
              style={{
                width: 10,
                height: 10,
                background: bucketColor(i as 0 | 1 | 2 | 3 | 4),
                outline: '1px solid var(--border)',
                outlineOffset: -1,
              }}
            />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}

function bucketColor(level: 0 | 1 | 2 | 3 | 4): string {
  return `var(--heatmap-${level})`;
}

function labelFor(level: 0 | 1 | 2 | 3 | 4): string {
  switch (level) {
    case 0: return 'no scheduled focus';
    case 1: return 'partial — under 25%';
    case 2: return 'partial — 25–50%';
    case 3: return 'partial — 50–80%';
    case 4: return 'fully kept';
  }
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

interface MonthLabel {
  label: string;
}

function buildMatrix(cells: HeatmapCell[]): {
  columns: (HeatmapCell | null)[][];
  monthLabels: MonthLabel[];
} {
  if (cells.length === 0) {
    return { columns: [], monthLabels: [] };
  }

  const first = parseISO(cells[0].date);
  const leadingPad = first.getDay(); // Sunday = 0

  // Flat list: null-padded start, then all cells
  const flat: (HeatmapCell | null)[] = [];
  for (let i = 0; i < leadingPad; i++) flat.push(null);
  for (const c of cells) flat.push(c);

  // Pad trailing to complete the final week
  while (flat.length % 7 !== 0) flat.push(null);

  // Pack into columns of 7 (each column = one week, Sun→Sat)
  const columns: (HeatmapCell | null)[][] = [];
  for (let i = 0; i < flat.length; i += 7) {
    columns.push(flat.slice(i, i + 7));
  }

  // Month labels: label the first column of each month
  const monthLabels: MonthLabel[] = [];
  let lastMonth = '';
  for (let ci = 0; ci < columns.length; ci++) {
    const col = columns[ci];
    const cell = col.find((c) => c !== null) ?? null;
    if (!cell) {
      monthLabels.push({ label: '' });
      continue;
    }
    const monthName = parseISO(cell.date).toLocaleDateString(undefined, { month: 'short' });
    if (monthName !== lastMonth) {
      monthLabels.push({ label: monthName });
      lastMonth = monthName;
    } else {
      monthLabels.push({ label: '' });
    }
  }

  return { columns, monthLabels };
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d);
}
