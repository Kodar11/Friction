import { useEffect, useState } from 'react';
import { ArrowRight, AlertCircle, ExternalLink, Flame, Info, Layers, CalendarClock, Clock, Percent, Power, RefreshCw, ShieldCheck, ShieldOff, ShieldAlert, Loader2 } from 'lucide-react';
import { useConfig } from '../hooks/useConfig';
import { useStatus } from '../hooks/useStatus';
import { useAdminState } from '../hooks/useAdminState';
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
  const adminState = useAdminState();
  const stats = useStats();
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

      {adminState && !adminState.isAdmin && <AdminRelaunchBanner />}

      <StatStrip stats={stats} onViewAll={() => props.onNavigate('stats')} />

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

        {status?.lastError && !status.permissionDenied && (
          <>
            <div className="divider" />
            <div className="px-5 py-3 flex items-start gap-2 text-[12.5px]" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <div>Last service error: {status.lastError}</div>
            </div>
          </>
        )}

        {isActive && inWindow && <BrowserCacheHint />}
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

function StatStrip(props: { stats: StatsBundle | null; onViewAll: () => void }) {
  const s = props.stats;
  const streak = s?.streak.current ?? 0;
  const week = s?.timeSaved.week ?? 0;
  const adherence = s?.adherence.week ?? 0;
  return (
    <div className="grid grid-cols-4 gap-3">
      <MiniStat
        Icon={Flame}
        label="Streak"
        value={`${streak}d`}
        accent={streak >= 7 ? 'var(--warning)' : undefined}
        suffix={streak >= 7 ? '🔥' : ''}
      />
      <MiniStat
        Icon={Clock}
        label="Saved · this week"
        value={formatHoursShort(week)}
      />
      <MiniStat
        Icon={Percent}
        label="Adherence · week"
        value={`${adherence}%`}
      />
      <button
        onClick={props.onViewAll}
        className="card text-left p-4 transition-colors group"
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = '')}
      >
        <div className="flex items-center gap-2 text-muted">
          <ArrowRight size={14} />
          <span className="text-[12px] uppercase tracking-wide">Full stats</span>
        </div>
        <div className="text-[14px] mt-3 text-default">View streak, heatmap, and the deactivation log →</div>
      </button>
    </div>
  );
}

function MiniStat(props: {
  Icon: typeof Flame;
  label: string;
  value: string;
  accent?: string;
  suffix?: string;
}) {
  const { Icon } = props;
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-muted">
        <Icon size={13} style={props.accent ? { color: props.accent } : undefined} />
        <span className="text-[11.5px] uppercase tracking-wide">{props.label}</span>
      </div>
      <div className="text-[22px] font-semibold mt-2 leading-none tabular-nums flex items-baseline gap-1.5">
        {props.value}
        {props.suffix && <span className="text-[14px]">{props.suffix}</span>}
      </div>
    </div>
  );
}

function formatHoursShort(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  if (hours < 10) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours)}h`;
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

function BrowserCacheHint() {
  const [flushBusy, setFlushBusy] = useState(false);
  const [flushFlash, setFlushFlash] = useState<'ok' | 'fail' | null>(null);
  const [browserBusy, setBrowserBusy] = useState(false);

  const flush = async () => {
    setFlushBusy(true);
    setFlushFlash(null);
    try {
      const r = await window.blocker.flushDnsNow();
      setFlushFlash(r.ok ? 'ok' : 'fail');
      setTimeout(() => setFlushFlash(null), 1800);
    } finally {
      setFlushBusy(false);
    }
  };

  const openBrowserDns = async () => {
    setBrowserBusy(true);
    try {
      await window.blocker.openBrowserDnsPage();
    } finally {
      setBrowserBusy(false);
    }
  };

  return (
    <>
      <div className="divider" />
      <div
        className="px-5 py-3 text-[12.5px]"
        style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
      >
        <div className="flex items-start gap-2">
          <Info size={14} className="mt-0.5 shrink-0" />
          <div className="flex-1 leading-relaxed">
            Browsers keep their own DNS &amp; HTTP caches. After flushing the OS, click
            <strong className="text-default"> Clear browser cache</strong> below to open
            <code className="kbd ml-1">chrome://net-internals/#dns</code> in your default
            browser — then click <em>"Clear host cache"</em> there. Or just hard-refresh
            the tab with <span className="kbd">Ctrl + Shift + R</span>.
          </div>
        </div>
        <div className="mt-2.5 ml-6 flex flex-wrap gap-1.5">
          <button onClick={flush} disabled={flushBusy} className="btn btn-ghost">
            {flushBusy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {flushFlash === 'ok' ? 'Flushed' : flushFlash === 'fail' ? 'Failed' : 'Flush OS DNS'}
          </button>
          <button onClick={openBrowserDns} disabled={browserBusy} className="btn btn-ghost">
            {browserBusy ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}
            Clear browser cache
          </button>
        </div>
        <div className="mt-2 ml-6 text-[11.5px] text-faint leading-relaxed">
          Heads up: Brave / Chrome / Edge can use DNS-over-HTTPS, which bypasses the hosts file.
          If a site still loads after both flushes, disable DoH in browser settings.
        </div>
      </div>
    </>
  );
}

function AdminRelaunchBanner() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await window.blocker.relaunchAsAdmin();
      if (!r.ok) {
        setError(r.error ?? 'Failed to elevate.');
        setBusy(false);
      }
      // On success, the elevated instance is starting and we'll quit shortly.
      // Leaving busy=true so the button stays in its loading state.
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
            Admin permission needed to enable blocking
          </div>
          <p className="text-[12.5px] mt-1 leading-relaxed" style={{ color: 'var(--warning)', opacity: 0.85 }}>
            Focus Blocker writes to <code className="kbd">C:\Windows\System32\drivers\etc\hosts</code>,
            which Windows protects. Click below to relaunch the app with admin rights — one UAC prompt and
            blocking just works.
          </p>
          {error && (
            <p className="text-[12px] mt-2" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}
        </div>
        <button
          onClick={onClick}
          disabled={busy}
          className="btn"
          style={{
            background: 'var(--warning)',
            color: '#fff',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          {busy ? 'Relaunching…' : 'Restart with admin'}
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
