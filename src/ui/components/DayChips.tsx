import { useState } from 'react';

interface Props {
  value: number[];
  onChange: (next: number[]) => void;
  compact?: boolean;
}

const LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function DayChips({ value, onChange, compact }: Props) {
  const [shakingDay, setShakingDay] = useState<number | null>(null);

  const toggle = (i: number) => {
    const set = new Set(value);
    if (set.has(i)) {
      if (set.size === 1) {
        setShakingDay(i);
        setTimeout(() => setShakingDay(null), 400);
        return;
      }
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
      <div className={'flex ' + (compact ? 'gap-1' : 'gap-1.5')} role="group" aria-label="Days of the week">
        {LABELS.map((label, i) => {
          const on = value.includes(i);
          const isShaking = shakingDay === i;
          return (
            <button
              key={i}
              onClick={() => toggle(i)}
              aria-label={`${FULL[i]}${on ? ' (selected)' : ''}`}
              title={value.length === 1 && value[0] === i ? 'At least one day required' : FULL[i]}
              className={
                (compact ? 'h-6 w-6 text-[11px]' : 'h-7 w-7 text-[12px]') +
                ' inline-flex items-center justify-center rounded-md font-semibold transition-colors tabular-nums' +
                (isShaking ? ' animate-[shake_0.4s_ease-in-out]' : '')
              }
              style={{
                background: on ? 'var(--text)' : 'var(--bg-secondary)',
                color: on ? 'var(--bg)' : 'var(--text-muted)',
                border: '1px solid ' + (on ? 'var(--text)' : isShaking ? 'var(--danger)' : 'var(--border)'),
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
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-3px); }
          75% { transform: translateX(3px); }
        }
      `}</style>
    </div>
  );
}