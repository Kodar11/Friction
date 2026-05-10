import { useEffect, useState } from 'react';
import { ArrowRight, AlertCircle, Flame, Layers, CalendarClock, Clock, Percent, Power, RefreshCw, ShieldCheck, ShieldOff, ShieldAlert, Loader2 } from 'lucide-react';
import { useConfig } from '../hooks/useConfig';
import { useStatus } from '../hooks/useStatus';
import { useServiceState } from '../hooks/useServiceState';
import { useStats } from '../hooks/useStats';
import { DeactivateDialog } from '../components/DeactivateDialog';
import { Timeline } from '../components/Timeline';
import type { Route } from '../components/Sidebar';

interface DeactivateDialogState {
  flow: 'needs-confirm' | 'needs-phrase' | 'needs-countdown' | 'blocked';
  countdownMs?: number;
  requiredPhrase?: string;
}

export function DashboardPage(props: { onNavigate: (r: Route) => void }) {
  const { config } = useConfig();
  const status = useStatus();
  const serviceState = useServiceState();
  const { stats, error: statsError, loading: statsLoading, refresh: refreshStats } = useStats();
  const [busy, setBusy] = useState(false);
  const [dialogState, setDialogState] = useState<DeactivateDialogState | null>(null);
  const [nowMinute, setNowMinute] = useState(currentMinute);

  useEffect(() => {
    const t = setInterval(() => setNowMinute(currentMinute()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!config) return <Skeleton />;

  const onActivate = async () => {
    setBusy(true);
    try { await window.blocker.activate(); } finally { setBusy(false); }
  };

  const onRequestDeactivate = async () => {
    setBusy(true);
    try {
      const r = await window.blocker.requestDeactivate();
      if (r.result === 'allowed') {
        // 'off' Hard Mode — no friction, deactivate immediately.
        await window.blocker.completeDeactivate({ reason: null });
      } else {
        setDialogState({
          flow: r.result,
          countdownMs: r.countdownMs,
          requiredPhrase: r.requiredPhrase,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const onDialogComplete = async (reason: string | null) => {
    setBusy(true);
    try {
      await window.blocker.completeDeactivate({ reason });
    } finally {
      setBusy(false);
      setDialogState(null);
    }
  };

  const onDialogCancel = async (reason: string | null) => {
    // Don't log a cancellation for the 'blocked' flow — the user never
    // actually started a real friction attempt; main refused upfront.
    if (dialogState && dialogState.flow !== 'blocked') {
      try {
        await window.blocker.cancelDeactivate({ reason });
      } catch {
        // ignore
      }
    }
    setDialogState(null);
  };

  const blocking = status?.currentlyBlocking ?? [];
  const isActive = config.active;
  const inWindow = blocking.length > 0;
  const totalSites = config.siteGroups.reduce((n, g) => n + g.sites.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-default">Dashboard</h1>
          <p className="text-[13.5px] text-muted mt-0.5">An overview of your blocking schedule and status.</p>
        </div>
        {!isActive ? (
          <button onClick={onActivate} disabled={busy} className="btn btn-primary">
            <Power size={14} /> Activate
          </button>
        ) : (
          <button onClick={onRequestDeactivate} disabled={busy} className="btn btn-danger">
            <Power size={14} /> Deactivate
          </button>
        )}
      </div>

      {serviceState && !serviceState.installed && <ServiceInstallBanner />}
      {status?.serviceOutOfDate && (
        <ServiceOutOfDateBanner
          serviceVersion={status.serviceVersion}
          appVersion={status.appVersion}
        />
      )}

      {/* Status hero */}
      <section className="card overflow-hidden">
        <div className="card-section">
          <div className="flex items-start gap-3">
            <StatusIcon active={isActive} inWindow={inWindow} />
            <div className="flex-1">
              <div className="text-[13px] text-muted uppercase tracking-wide">Status</div>
              <div className="text-[22px] font-semibold mt-0.5">
                {isActive ? (inWindow ? 'Blocking now' : 'Active — outside any window') : 'Inactive'}
              </div>
              <div className="text-[13.5px] text-muted mt-1">
                {inWindow
                  ? `Currently blocking ${blocking.map((g) => g.groupName).join(', ')}.`
                  : isActive
                    ? 'No groups are scheduled at this minute. Sites are reachable.'
                    : 'Activate to start enforcing your schedule.'}
              </div>
              <NextChange status={status} />
              <FlushIndicator status={status} />
            </div>
            <ServiceBadge running={!!status?.serviceRunning} />
          </div>
        </div>

        {status?.lastError && !status.permissionDenied && !status.serviceOutOfDate && (
          <>
            <div className="divider" />
            <div className="px-5 py-3 flex items-start gap-2 text-[12.5px]" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <div>Last service error: {status.lastError}</div>
            </div>
          </>
        )}

      </section>

      {/* Today's schedule preview */}
      <section className="card">
        <div className="card-section flex items-center justify-between">
          <div>
            <div className="text-[13px] text-muted uppercase tracking-wide">Today</div>
            <div className="text-[16px] font-medium mt-0.5">Schedule preview</div>
          </div>
          <button onClick={() => props.onNavigate('schedule')} className="btn btn-ghost">
            Edit schedule <ArrowRight size={13} />
          </button>
        </div>
        <div className="px-5 pb-5">
          <Timeline
            blocks={config.scheduleBlocks}
            groups={config.siteGroups}
            nowMinute={nowMinute}
            compact
            onSelectBlock={() => props.onNavigate('schedule')}
            onCreateRange={() => props.onNavigate('schedule')}
          />
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <QuickCard
          Icon={Layers}
          label="Site groups"
          value={`${config.siteGroups.length}`}
          subtitle={`${totalSites} site${totalSites === 1 ? '' : 's'} total`}
          onClick={() => props.onNavigate('groups')}
        />
        <QuickCard
          Icon={CalendarClock}
          label="Schedule blocks"
          value={`${config.scheduleBlocks.length}`}
          subtitle={config.scheduleBlocks.length === 0 ? 'Add your first block' : 'Configured'}
          onClick={() => props.onNavigate('schedule')}
        />
      </div>

      <WeekActivity
        stats={stats}
        loading={statsLoading}
        error={statsError}
        onRetry={refreshStats}
        onViewAll={() => props.onNavigate('stats')}
      />

      <DeactivateDialog
        open={dialogState !== null}
        flow={dialogState?.flow ?? 'needs-confirm'}
        countdownMs={dialogState?.countdownMs}
        requiredPhrase={dialogState?.requiredPhrase}
        onComplete={onDialogComplete}
        onCancel={onDialogCancel}
      />
    </div>
  );
}

function WeekActivity(props: {
  stats: StatsBundle | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onViewAll: () => void;
}) {
  const s = props.stats;
  if (props.loading && !s) {
    return (
      <section className="card">
        <div className="card-section flex items-center justify-between">
          <div>
            <div className="text-[12.5px] uppercase tracking-wide text-muted">This week</div>
            <div className="text-[15.5px] font-medium mt-0.5">Activity</div>
          </div>
        </div>
        <div className="divider" />
        <div className="px-5 py-5 text-[12.5px] text-muted">Loading stats…</div>
      </section>
    );
  }
  if (props.error && !s) {
    return (
      <section className="card">
        <div className="card-section flex items-center justify-between">
          <div>
            <div className="text-[12.5px] uppercase tracking-wide text-muted">This week</div>
            <div className="text-[15.5px] font-medium mt-0.5">Activity</div>
          </div>
          <button onClick={props.onRetry} className="btn btn-ghost">
            Retry <ArrowRight size={13} />
          </button>
        </div>
        <div className="divider" />
        <div className="px-5 py-5 text-[12.5px]" style={{ color: 'var(--danger)' }}>
          Stats unavailable: {props.error}
        </div>
      </section>
    );
  }
  const streak = s?.streak.current ?? 0;
  const week = s?.timeSaved.week ?? 0;
  const adherence = s?.adherence.week ?? 0;
  const noData = s !== null && week === 0 && streak === 0 && s.timeSaved.allTime === 0;

  return (
    <section className="card overflow-hidden">
      <div className="card-section flex items-center justify-between">
        <div>
          <div className="text-[12.5px] uppercase tracking-wide text-muted">This week</div>
          <div className="text-[15.5px] font-medium mt-0.5">Activity</div>
        </div>
        <button onClick={props.onViewAll} className="btn btn-ghost">
          Full stats <ArrowRight size={13} />
        </button>
      </div>
      <div className="divider" />
      <div className="grid grid-cols-3">
        <ActivityStat
          Icon={Flame}
          label="Current streak"
          value={`${streak}`}
          unit={streak === 1 ? 'day' : 'days'}
          hint={streak >= 7 ? 'on a roll 🔥' : streak === 0 ? 'just getting started' : 'keep going'}
          accent={streak >= 7 ? 'var(--warning)' : 'var(--text-muted)'}
        />
        <ActivityStat
          Icon={Clock}
          label="Time saved"
          value={formatHoursValue(week)}
          unit={week >= 60 ? 'hours' : 'minutes'}
          hint={week === 0 ? 'no scheduled focus completed yet' : 'in scheduled focus blocks'}
          accent="var(--text-muted)"
          divider
        />
        <ActivityStat
          Icon={Percent}
          label="Adherence"
          value={`${adherence}`}
          unit="%"
          hint={
            adherence === 0
              ? 'aim for ≥80% to keep the streak'
              : adherence >= 80
                ? 'meeting the streak threshold'
                : 'under the 80% streak threshold'
          }
          accent={adherence >= 80 ? 'var(--success)' : 'var(--text-muted)'}
          divider
        />
      </div>
      {noData && (
        <>
          <div className="divider" />
          <div
            className="px-5 py-3 text-[12px] text-muted leading-relaxed"
            style={{ background: 'var(--bg-secondary)' }}
          >
            Stats start populating after blocking is active during a scheduled window. Activate above
            and let your first block run — numbers fill in once the runtime logs activity.
          </div>
        </>
      )}
    </section>
  );
}

interface ActivityStatProps {
  Icon: typeof Flame;
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  accent?: string;
  /** Renders a left-side divider — used on the 2nd and 3rd cells. */
  divider?: boolean;
}

function ActivityStat(props: ActivityStatProps) {
  const { Icon } = props;
  return (
    <div
      className="px-5 py-5 relative"
      style={{
        borderLeft: props.divider ? '1px solid var(--border)' : 'none',
      }}
    >
      <div className="flex items-center gap-1.5 text-muted">
        <Icon size={13} style={props.accent ? { color: props.accent } : undefined} />
        <span className="text-[11.5px] uppercase tracking-wide">{props.label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[30px] font-semibold leading-none tabular-nums">{props.value}</span>
        {props.unit && <span className="text-[13px] text-muted">{props.unit}</span>}
      </div>
      {props.hint && (
        <div className="mt-2 text-[11.5px] text-faint leading-snug">{props.hint}</div>
      )}
    </div>
  );
}

function formatHoursValue(minutes: number): string {
  if (minutes < 60) return `${minutes}`;
  const hours = minutes / 60;
  if (hours < 10) return hours.toFixed(1);
  return `${Math.round(hours)}`;
}

function StatusIcon(props: { active: boolean; inWindow: boolean }) {
  if (props.active && props.inWindow) {
    return (
      <div
        className="h-9 w-9 grid place-items-center rounded-lg shrink-0"
        style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
      >
        <ShieldCheck size={18} />
      </div>
    );
  }
  if (props.active) {
    return (
      <div
        className="h-9 w-9 grid place-items-center rounded-lg shrink-0"
        style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
      >
        <ShieldCheck size={18} />
      </div>
    );
  }
  return (
    <div
      className="h-9 w-9 grid place-items-center rounded-lg shrink-0"
      style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
    >
      <ShieldOff size={18} />
    </div>
  );
}

function ServiceInstallBanner() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onInstall = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await window.blocker.installService();
      if (!r.ok) {
        setError(r.error ?? 'Install failed.');
        setBusy(false);
      }
      // On success, the service is starting. Leaving busy=true so the button
      // stays in its loading state until the status poll refreshes.
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setBusy(false);
    }
  };

  return (
    <section
      className="card overflow-hidden"
      style={{
        background: 'var(--warning-soft)',
        borderColor: 'rgba(217, 115, 13, 0.25)',
      }}
    >
      <div className="card-section flex items-start gap-3">
        <div
          className="h-9 w-9 grid place-items-center rounded-lg shrink-0"
          style={{ background: 'var(--bg)', color: 'var(--warning)' }}
        >
          <ShieldAlert size={18} />
        </div>
        <div className="flex-1">
          <div className="text-[14.5px] font-semibold" style={{ color: 'var(--warning)' }}>
            Install the background service to enable blocking
          </div>
          <p className="text-[12.5px] mt-1 leading-relaxed" style={{ color: 'var(--warning)', opacity: 0.85 }}>
            Focus Blocker uses a Windows Service to edit{' '}
            <code className="kbd">C:\Windows\System32\drivers\etc\hosts</code>. You only need to
            approve the UAC prompt once during install — after that the service starts
            automatically on boot and keeps blocking even when this window is closed.
          </p>
          {error && (
            <p className="text-[12px] mt-2" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}
        </div>
        <button
          onClick={onInstall}
          disabled={busy}
          className="btn"
          style={{
            background: 'var(--warning)',
            color: '#fff',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          {busy ? 'Installing…' : 'Install service'}
        </button>
      </div>
    </section>
  );
}

function ServiceOutOfDateBanner(props: { serviceVersion: string | null; appVersion: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onInstall = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await window.blocker.installService();
      if (!r.ok) setError(r.error ?? 'Install failed.');
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="card overflow-hidden"
      style={{ background: 'var(--warning-soft)', borderColor: 'rgba(217, 115, 13, 0.25)' }}
    >
      <div className="card-section flex items-start gap-3">
        <div
          className="h-9 w-9 grid place-items-center rounded-lg shrink-0"
          style={{ background: 'var(--bg)', color: 'var(--warning)' }}
        >
          <ShieldAlert size={18} />
        </div>
        <div className="flex-1">
          <div className="text-[14.5px] font-semibold" style={{ color: 'var(--warning)' }}>
            Background service needs an update
          </div>
          <p className="text-[12.5px] mt-1 leading-relaxed" style={{ color: 'var(--warning)', opacity: 0.85 }}>
            Your app is {props.appVersion}, but the service reports {props.serviceVersion ?? 'unknown'}. Reinstalling
            the service fixes stats logging and removes the version mismatch.
          </p>
          {error && (
            <p className="text-[12px] mt-2" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}
        </div>
        <button
          onClick={onInstall}
          disabled={busy}
          className="btn"
          style={{ background: 'var(--warning)', color: '#fff', opacity: busy ? 0.6 : 1 }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          {busy ? 'Reinstalling…' : 'Reinstall service'}
        </button>
      </div>
    </section>
  );
}

function ServiceBadge(props: { running: boolean }) {
  return (
    <div
      className="chip"
      style={{
        background: props.running ? 'var(--success-soft)' : 'var(--warning-soft)',
        color: props.running ? 'var(--success)' : 'var(--warning)',
        borderColor: 'transparent',
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: props.running ? 'var(--success)' : 'var(--warning)' }}
      />
      {props.running ? 'Service running' : 'Service idle'}
    </div>
  );
}

function FlushIndicator(props: { status: BlockerStatus | null }) {
  const ts = props.status?.lastFlushedAt ?? null;
  if (!ts) return null;
  const ago = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  const label =
    ago < 5 ? 'just now'
    : ago < 60 ? `${ago}s ago`
    : ago < 3600 ? `${Math.floor(ago / 60)}m ago`
    : `${Math.floor(ago / 3600)}h ago`;
  return (
    <div className="text-[12px] text-faint mt-0.5 inline-flex items-center gap-1.5">
      <RefreshCw size={11} />
      DNS flushed {label}
    </div>
  );
}

function NextChange(props: { status: BlockerStatus | null }) {
  if (!props.status?.nextChange) return null;
  const target = props.status.nextChange.atMinute;
  const cur = currentMinute();
  let delta = target - cur;
  if (delta < 0) delta += 1440;
  const hh = Math.floor(delta / 60);
  const mm = delta % 60;
  return (
    <div className="text-[12px] text-faint mt-2">
      Next change in {hh > 0 ? `${hh}h ` : ''}{mm}m · at {fmt(target)}
    </div>
  );
}

function QuickCard(props: {
  Icon: typeof Layers;
  label: string;
  value: string;
  subtitle: string;
  onClick: () => void;
}) {
  const { Icon } = props;
  return (
    <button
      onClick={props.onClick}
      className="card text-left p-5 transition-colors"
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = '')}
    >
      <div className="flex items-center gap-2 text-muted">
        <Icon size={14} />
        <span className="text-[12px] uppercase tracking-wide">{props.label}</span>
      </div>
      <div className="text-[28px] font-semibold mt-1.5 leading-none">{props.value}</div>
      <div className="text-[12.5px] text-muted mt-1.5">{props.subtitle}</div>
    </button>
  );
}

function Skeleton() {
  return (
    <div className="card card-section text-[13px] text-muted">Loading…</div>
  );
}

function fmt(m: number) {
  const h = Math.floor(m / 60).toString().padStart(2, '0');
  const mm = (m % 60).toString().padStart(2, '0');
  return `${h}:${mm}`;
}
function currentMinute() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
