/**
 * Seven small toggle chips for picking which days of the week a schedule
 * block applies on. 0 = Sunday … 6 = Saturday.
 *
 * Convention matches `ScheduleBlock.days`. All chips selected by default
 * (every day) so the legacy v1 behaviour is preserved unless the user
 * narrows it.
 */

interface Props {
  value: number[];
  onChange: (next: number[]) => void;
  /** Tiny variant for inline use. */
  compact?: boolean;
}

const LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function DayChips({ value, onChange, compact }: Props) {
  const toggle = (i: number) => {
    const set = new Set(value);
    if (set.has(i)) {
      // Don't let the user end up with zero days — that'd silently neuter
      // the block. Keep at least one day selected.
      if (set.size === 1) return;
      set.delete(i);
    } else {
      set.add(i);
    }
    onChange([...set].sort());
  };

  const setAll = () => onChange([0, 1, 2, 3, 4, 5, 6]);
  const setWeekdays = () => onChange([1, 2, 3, 4, 5]);
  const setWeekends = () => onChange([0, 6]);

  return (
    <div>
      <div className={'flex ' + (compact ? 'gap-1' : 'gap-1.5')}>
        {LABELS.map((label, i) => {
          const on = value.includes(i);
          return (
            <button
              key={i}
              onClick={() => toggle(i)}
              aria-label={`${FULL[i]}${on ? ' (selected)' : ''}`}
              title={FULL[i]}
              className={
                (compact ? 'h-6 w-6 text-[11px]' : 'h-7 w-7 text-[12px]') +
                ' inline-flex items-center justify-center rounded-md font-semibold transition-colors tabular-nums'
              }
              style={{
                background: on ? 'var(--text)' : 'var(--bg-secondary)',
                color: on ? 'var(--bg)' : 'var(--text-muted)',
                border: '1px solid ' + (on ? 'var(--text)' : 'var(--border)'),
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      {!compact && (
        <div className="mt-2 flex gap-2 text-[11.5px] text-faint">
          <button onClick={setAll} className="hover:text-default transition-colors">Every day</button>
          <span>·</span>
          <button onClick={setWeekdays} className="hover:text-default transition-colors">Weekdays</button>
          <span>·</span>
          <button onClick={setWeekends} className="hover:text-default transition-colors">Weekends</button>
        </div>
      )}
    </div>
  );
}
