import { useEffect, useState } from 'react';
import { Award, Clock, Flame, Percent, ShieldOff, Trophy } from 'lucide-react';
import { useStats } from '../hooks/useStats';
import { StatCard } from '../components/StatCard';
import { Heatmap } from '../components/Heatmap';

export function StatsPage() {
  const stats = useStats();
  const [log, setLog] = useState<DeactivationEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const entries = await window.blocker.getDeactivationLog();
        if (!cancelled) setLog(entries);
      } catch {}
    };
    void fetch();
    const t = setInterval(fetch, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (!stats) {
    return <div className="card card-section text-[13px] text-muted">Loading stats…</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-default">Stats</h1>
        <p className="text-[13.5px] text-muted mt-0.5">
          All numbers are computed from your local activity log. Nothing leaves the machine.
        </p>
      </div>

      {/* Streak hero */}
      <section className="card card-section">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <div className="text-[12px] uppercase tracking-wide text-muted flex items-center gap-1.5">
              <Flame size={13} /> Current streak
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[44px] font-semibold leading-none tabular-nums">
                {stats.streak.current}
              </span>
              <span className="text-[15px] text-muted">day{stats.streak.current === 1 ? '' : 's'}</span>
              {stats.streak.current >= 7 && <span className="text-[20px]">🔥</span>}
            </div>
            {stats.streak.lastActiveDate && (
              <div className="mt-1 text-[12px] text-faint">last counted: {stats.streak.lastActiveDate}</div>
            )}
          </div>
          <div>
            <div className="text-[12px] uppercase tracking-wide text-muted flex items-center gap-1.5">
              <Trophy size={13} /> Longest ever
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[28px] font-semibold leading-none tabular-nums">
                {stats.streak.longest}
              </span>
              <span className="text-[14px] text-muted">days</span>
            </div>
          </div>
          <StreakHelp />
        </div>
      </section>

      {/* Time saved + adherence */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          Icon={Clock}
          label="Time saved · this week"
          value={formatHours(stats.timeSaved.week)}
          subtitle={`${formatHours(stats.timeSaved.month)} this month`}
        />
        <StatCard
          Icon={Percent}
          label="Adherence · this week"
          value={`${stats.adherence.week}%`}
          subtitle={`${stats.adherence.month}% this month`}
        />
        <StatCard
          Icon={Clock}
          label="Time saved · all time"
          value={formatHours(stats.timeSaved.allTime)}
        />
        <StatCard
          Icon={Award}
          label="Deactivations logged"
          value={`${log.length}`}
          subtitle={`${log.filter((e) => e.cancelled).length} cancelled before completion`}
        />
      </div>

      {/* Heatmap */}
      <section className="card">
        <div className="card-section">
          <div className="text-[12px] uppercase tracking-wide text-muted">Last 90 days</div>
          <div className="text-[16px] font-medium mt-0.5">Adherence heatmap</div>
        </div>
        <div className="px-5 pb-5">
          <Heatmap cells={stats.heatmap} />
        </div>
      </section>

      {/* Deactivation log */}
      <section className="card">
        <div className="card-section">
          <div className="text-[12px] uppercase tracking-wide text-muted">History</div>
          <div className="text-[16px] font-medium mt-0.5">Deactivation log</div>
        </div>
        <div className="divider" />
        <DeactivationTable log={log} />
      </section>
    </div>
  );
}

function StreakHelp() {
  return (
    <div className="ml-auto max-w-sm text-[11.5px] text-faint leading-relaxed">
      A day "counts" if blocking was active for ≥80% of your scheduled focus time that day.
      Days with no scheduled blocks are neutral — they don't extend or break the streak.
    </div>
  );
}

function DeactivationTable({ log }: { log: DeactivationEntry[] }) {
  if (log.length === 0) {
    return (
      <div className="card-section text-[13px] text-muted text-center py-6">
        <ShieldOff size={18} className="mx-auto mb-2 opacity-60" />
        Nothing yet. Every deactivation gets logged here.
      </div>
    );
  }
  return (
    <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
      {log.slice(0, 50).map((e, i) => (
        <li key={i} className="px-5 py-3 flex items-start gap-3">
          <div className="text-[12px] text-muted tabular-nums w-32 shrink-0 mt-0.5">
            {formatDateTime(e.timestamp)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] flex items-center gap-2">
              <span className="font-medium capitalize">{e.hardModeLevel}</span>
              {e.cancelled && (
                <span
                  className="chip"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', borderColor: 'transparent' }}
                >
                  cancelled
                </span>
              )}
              {!e.cancelled && e.reactivatedAt && (
                <span
                  className="chip"
                  style={{
                    background: 'var(--success-soft)',
                    color: 'var(--success)',
                    borderColor: 'transparent',
                  }}
                >
                  off for {formatDuration(e.reactivatedAt - e.timestamp)}
                </span>
              )}
              {!e.cancelled && !e.reactivatedAt && (
                <span
                  className="chip"
                  style={{
                    background: 'var(--warning-soft)',
                    color: 'var(--warning)',
                    borderColor: 'transparent',
                  }}
                >
                  still off
                </span>
              )}
            </div>
            {e.reason && (
              <div className="text-[12.5px] text-muted mt-1 break-words whitespace-pre-line">
                {e.reason}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatHours(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  if (hours < 10) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours)}h`;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return `${hours}h`;
  return `${hours}h ${rem}m`;
}
