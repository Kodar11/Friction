import { useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  blocks: ScheduleBlock[];
  groups: SiteGroup[];
  /** Highlights "now" position. */
  nowMinute: number;
  compact?: boolean;
  onSelectBlock: (id: string) => void;
  onCreateRange: (startMinute: number, endMinute: number) => void;
}

const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21, 24];
const SNAP_MINUTES = 15;

/**
 * 24-hour drag-to-create timeline.
 *
 * Block design: tinted fill (rgba accent at 16-20% alpha) + a 3px-wide accent
 * bar on the left edge, with the group name in the same accent colour. Reads
 * cleanly on either theme without per-theme palettes.
 */
export function Timeline({ blocks, groups, nowMinute, compact, onSelectBlock, onCreateRange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ start: number; current: number } | null>(null);

  const segments = useMemo(() => buildSegments(blocks), [blocks]);
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? '?';

  const minuteFromEvent = (e: { clientX: number }): number | null => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const ratio = clamp01((e.clientX - rect.left) / rect.width);
    return snap(ratio * 1440);
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const m = minuteFromEvent(e);
      if (m !== null) setDrag((d) => (d ? { ...d, current: m } : d));
    };
    const onUp = (e: MouseEvent) => {
      const m = minuteFromEvent(e) ?? drag.current;
      const a = Math.min(drag.start, m);
      const b = Math.max(drag.start, m);
      const start = a;
      const end = b === a ? Math.min(1440, a + 60) : b;
      setDrag(null);
      if (end > start) onCreateRange(start, end === 1440 ? 1439 : end);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp, { once: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, onCreateRange]);

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-block]')) return;
    const m = minuteFromEvent(e);
    if (m === null) return;
    setDrag({ start: m, current: m });
  };
  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const m = minuteFromEvent(e);
    if (m !== null) setHover(m);
  };
  const onMouseLeave = () => setHover(null);

  const previewStart = drag ? Math.min(drag.start, drag.current) : null;
  const previewEnd = drag ? Math.max(drag.start, drag.current) : null;

  const isEmpty = segments.length === 0 && drag === null;

  return (
    <div className="select-none">
      <div
        ref={wrapRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        className={'relative w-full ' + (compact ? 'h-16' : 'h-28')}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          cursor: drag ? 'grabbing' : 'crosshair',
        }}
      >
        {/* Hour gridlines */}
        <div
          className="absolute inset-0 grid pointer-events-none"
          style={{ gridTemplateColumns: 'repeat(24, 1fr)' }}
        >
          {Array.from({ length: 24 }, (_, i) => (
            <div
              key={i}
              className="h-full"
              style={{
                borderLeft: i === 0 ? 'none' : '1px solid var(--border)',
                opacity: i % 3 === 0 ? 1 : 0.5,
              }}
            />
          ))}
        </div>

        {/* Empty hint */}
        {isEmpty && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <span className="text-[12.5px] text-faint">Drag horizontally to add a focus block</span>
          </div>
        )}

        {/* Existing blocks */}
        {segments.map((seg) => {
          const left = (seg.start / 1440) * 100;
          const width = ((seg.end - seg.start) / 1440) * 100;
          const c = colourFor(seg.block.siteGroupIds[0] ?? seg.block.id);
          const names = seg.block.siteGroupIds.map(groupName).join(', ') || '(empty)';
          return (
            <button
              key={seg.key}
              data-block
              onClick={(e) => {
                e.stopPropagation();
                onSelectBlock(seg.block.id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute top-2 bottom-2 inline-flex items-center gap-1.5 px-2.5 overflow-hidden transition-[background,filter] duration-100 hover:brightness-110"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                background: `rgba(${c}, 0.16)`,
                color: `rgb(${c})`,
                borderRadius: '8px',
                borderLeft: `3px solid rgb(${c})`,
              }}
              title={`${names} · ${fmt(seg.block.startMinute)} → ${fmt(seg.block.endMinute)}`}
            >
              <span className="text-[12.5px] font-medium truncate" style={{ color: `rgb(${c})` }}>
                {names}
              </span>
            </button>
          );
        })}

        {/* Drag preview */}
        {previewStart !== null && previewEnd !== null && previewEnd > previewStart && (
          <div
            className="absolute top-2 bottom-2 inline-flex items-center px-2.5 pointer-events-none"
            style={{
              left: `${(previewStart / 1440) * 100}%`,
              width: `${((previewEnd - previewStart) / 1440) * 100}%`,
              background: 'var(--accent-soft)',
              borderLeft: '3px solid var(--accent)',
              borderRadius: '8px',
            }}
          >
            <span className="text-[12px] font-medium" style={{ color: 'var(--accent)' }}>
              {fmt(previewStart)} → {fmt(previewEnd)}
            </span>
          </div>
        )}

        {/* Hover guide */}
        {hover !== null && drag === null && (
          <>
            <div
              className="absolute top-1 bottom-1 w-px pointer-events-none"
              style={{ left: `${(hover / 1440) * 100}%`, background: 'var(--text-faint)' }}
            />
            <div
              className="absolute -top-7 inline-flex items-center justify-center text-[11px] px-1.5 py-0.5 rounded-md pointer-events-none whitespace-nowrap tabular-nums"
              style={{
                left: `calc(${(hover / 1440) * 100}% - 22px)`,
                background: 'var(--text)',
                color: 'var(--bg)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              {fmt(hover)}
            </div>
          </>
        )}

        {/* Now indicator */}
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{ left: `${(nowMinute / 1440) * 100}%` }}
        >
          <div className="h-full w-px" style={{ background: 'var(--accent)', opacity: 0.85 }} />
          <div
            className="absolute -top-1.5 -left-[4px] h-2 w-2 rounded-full"
            style={{
              background: 'var(--accent)',
              boxShadow: '0 0 0 3px var(--bg-secondary), 0 0 0 4px var(--accent-soft)',
            }}
          />
        </div>
      </div>

      {/* Hour scale */}
      <div className="relative mt-2.5 h-3">
        {HOUR_LABELS.map((h) => (
          <span
            key={h}
            className="absolute -translate-x-1/2 text-[10.5px] tabular-nums"
            style={{ left: `${(h / 24) * 100}%`, color: 'var(--text-faint)' }}
          >
            {String(h).padStart(2, '0')}:00
          </span>
        ))}
      </div>
    </div>
  );
}

interface Segment {
  key: string;
  start: number;
  end: number;
  block: ScheduleBlock;
}

function buildSegments(blocks: ScheduleBlock[]): Segment[] {
  const out: Segment[] = [];
  for (const b of blocks) {
    if (b.startMinute === b.endMinute) continue;
    if (b.startMinute < b.endMinute) {
      out.push({ key: b.id, start: b.startMinute, end: b.endMinute, block: b });
    } else {
      out.push({ key: b.id + ':a', start: b.startMinute, end: 1440, block: b });
      out.push({ key: b.id + ':b', start: 0, end: b.endMinute, block: b });
    }
  }
  return out;
}

// rgb() inputs — single saturated brand colour per group, used both for the
// 16% tint background and the 3px accent bar.
const PALETTE = [
  '217, 119, 6',   // amber
  '5, 150, 105',   // emerald
  '14, 165, 233',  // sky
  '139, 92, 246',  // violet
  '236, 72, 153',  // pink
  '249, 115, 22',  // orange
  '20, 184, 166',  // teal
];

function colourFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }
function snap(m: number) { return Math.round(m / SNAP_MINUTES) * SNAP_MINUTES; }
function fmt(m: number) {
  const h = Math.floor(m / 60).toString().padStart(2, '0');
  const mm = (m % 60).toString().padStart(2, '0');
  return `${h}:${mm}`;
}
