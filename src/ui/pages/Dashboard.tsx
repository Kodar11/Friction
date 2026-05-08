import { useEffect, useState } from 'react';
import { ArrowRight, AlertCircle, Layers, CalendarClock, Power, ShieldCheck, ShieldOff } from 'lucide-react';
import { useConfig } from '../hooks/useConfig';
import { useStatus } from '../hooks/useStatus';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Timeline } from '../components/Timeline';
import type { Route } from '../components/Sidebar';

export function DashboardPage(props: { onNavigate: (r: Route) => void }) {
  const { config } = useConfig();
  const status = useStatus();
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [busy, setBusy] = useState(false);
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
  const onDeactivate = async () => {
    setBusy(true);
    try { await window.blocker.deactivate(); } finally {
      setBusy(false);
      setConfirmDeactivate(false);
    }
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
          <button onClick={() => setConfirmDeactivate(true)} disabled={busy} className="btn btn-danger">
            <Power size={14} /> Deactivate
          </button>
        )}
      </div>

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
            </div>
            <ServiceBadge running={!!status?.serviceRunning} />
          </div>
        </div>

        {status?.lastError && (
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

      <ConfirmDialog
        open={confirmDeactivate}
        title="Deactivate blocking?"
        message="Sites will be unblocked immediately. You can re-activate any time."
        destructive
        confirmLabel="Deactivate"
        onConfirm={onDeactivate}
        onCancel={() => setConfirmDeactivate(false)}
      />
    </div>
  );
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
