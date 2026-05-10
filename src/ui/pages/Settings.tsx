import { useEffect, useState } from 'react';
import { Bug, Download, ExternalLink, FolderOpen, Globe, Loader2, RefreshCw, RotateCcw, ShieldAlert, ShieldCheck, ShieldOff, Trash2, Upload } from 'lucide-react';
import { useConfig } from '../hooks/useConfig';
import { useThemeStore, type Theme } from '../store/themeStore';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function SettingsPage() {
  const { config, update } = useConfig();
  const setTheme = useThemeStore((s) => s.setTheme);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!showDebug) return;
    let cancelled = false;
    const fetchLogs = async () => {
      const next = await window.blocker.getLogs(200);
      if (!cancelled) setLogs(next);
    };
    void fetchLogs();
    const t = setInterval(fetchLogs, 4_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [showDebug]);

  if (!config) return <div className="card card-section text-[13px] text-muted">Loading…</div>;

  const setPrefTheme = (theme: Theme) => {
    setTheme(theme);
    void update((draft) => { draft.preferences.theme = theme; });
  };

  const setAutoLaunch = async (enabled: boolean) => {
    await window.blocker.setAutoLaunch(enabled);
  };

  const onRestore = async () => {
    setRestoring(true);
    try { await window.blocker.restoreHostsFile(); } finally {
      setRestoring(false);
      setConfirmRestore(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-default">Settings</h1>
        <p className="text-[13.5px] text-muted mt-0.5">Personalize the app and recover from edge cases.</p>
      </div>

      <Section title="Appearance" subtitle="Theme is applied immediately and stored in your config.">
        <div
          className="inline-flex items-center gap-1 p-0.5 rounded-md"
          style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}
        >
          {(['system', 'light', 'dark'] as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => setPrefTheme(t)}
              className="h-7 px-3.5 text-[13px] rounded-[5px] transition-colors"
              style={{
                color: config.preferences.theme === t ? 'var(--text)' : 'var(--text-muted)',
                background: config.preferences.theme === t ? 'var(--bg)' : 'transparent',
                boxShadow: config.preferences.theme === t ? 'var(--shadow-sm)' : 'none',
              }}
            >
              {t === 'system' ? 'System' : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Startup">
        <ToggleRow
          label="Open Focus Blocker when I sign in"
          description="The window appears at login. Blocking continues regardless once the service is installed."
          checked={config.preferences.autoLaunchOnBoot}
          onChange={async (v) => {
            await setAutoLaunch(v);
            void update((draft) => { draft.preferences.autoLaunchOnBoot = v; });
          }}
        />
      </Section>

      <HardModeSection
        level={config.hardMode.level}
        onChange={async (level) => {
          await window.blocker.setHardMode(level);
        }}
      />

      <NotificationsSection
        notificationsEnabled={config.preferences.notificationsEnabled}
        weeklySummaryEnabled={config.preferences.weeklySummaryEnabled}
        onChangeMaster={async (v) => {
          await update((draft) => { draft.preferences.notificationsEnabled = v; });
        }}
        onChangeWeekly={async (v) => {
          await update((draft) => { draft.preferences.weeklySummaryEnabled = v; });
        }}
      />

      <ServiceSection />

      <Section title="Recovery" subtitle="Removes only the focus-blocker region between our markers; entries outside are untouched.">
        <div className="flex flex-wrap gap-2">
          <FlushDnsButton />
          <BrowserDnsButton />
          <button onClick={() => setConfirmRestore(true)} disabled={restoring} className="btn">
            <RotateCcw size={14} /> {restoring ? 'Restoring…' : 'Restore hosts file'}
          </button>
        </div>
        <p className="text-[12px] text-muted mt-3 leading-relaxed">
          <strong className="text-default">Flush network caches</strong> clears the OS resolver, ARP,
          and destination caches.{' '}
          <strong className="text-default">Clear browser cache</strong> opens
          <code className="kbd mx-1">chrome://net-internals/#dns</code> in your default browser so you
          can click "Clear host cache" — that's the only way to evict
          Brave/Chrome/Edge's in-process DNS cache.
        </p>
        <p className="text-[12px] text-muted mt-2 leading-relaxed">
          If a site still loads after both, your browser is probably using DNS-over-HTTPS, which
          bypasses the hosts file. Disable DoH in browser settings (Brave: Settings → Privacy and
          security → Security → Use secure DNS).
        </p>
      </Section>

      <ImportExportSection />

      <Section title="Logs &amp; debug">
        <div className="flex items-center gap-2">
          <button onClick={() => window.blocker.openLogFolder()} className="btn">
            <FolderOpen size={14} /> Open log folder <ExternalLink size={11} className="ml-0.5 text-muted" />
          </button>
          <button onClick={() => setShowDebug((v) => !v)} className="btn">
            <Bug size={14} /> {showDebug ? 'Hide' : 'Show'} debug
          </button>
        </div>
        {showDebug && (
          <div
            className="mt-3 max-h-72 overflow-y-auto rounded-md font-mono text-[11.5px] p-3"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            {logs.length === 0 ? (
              <div className="text-muted">No logs yet.</div>
            ) : (
              logs.map((l, i) => (
                <div key={i} style={{ color: levelColour(l.level) }}>
                  [{new Date(l.timestamp).toISOString().slice(11, 19)}] [{l.source}] [{l.level}] {l.message}
                </div>
              ))
            )}
          </div>
        )}
      </Section>

      <ConfirmDialog
        open={confirmRestore}
        title="Restore the hosts file?"
        message="This removes Focus Blocker's managed region from your hosts file. Blocking will stop until you re-activate."
        confirmLabel="Restore"
        onConfirm={onRestore}
        onCancel={() => setConfirmRestore(false)}
      />
    </div>
  );
}

// --- Hard Mode ---

const HARD_MODE_LEVELS: { id: HardModeLevel; title: string; description: string }[] = [
  { id: 'off', title: 'Off', description: 'Deactivate instantly with no friction.' },
  { id: 'light', title: 'Light', description: 'A simple confirm dialog before deactivating. Default.' },
  { id: 'medium', title: 'Medium', description: 'Type the exact phrase “DEACTIVATE FOCUS BLOCKER” to deactivate.' },
  { id: 'hard', title: 'Hard', description: '5-minute cool-down + a required reason that gets logged.' },
  { id: 'extreme', title: 'Extreme', description: 'Same as Hard, but blocking can\'t be deactivated during a scheduled window at all.' },
];

function HardModeSection(props: {
  level: HardModeLevel;
  onChange: (level: HardModeLevel) => void | Promise<void>;
}) {
  return (
    <Section
      title="Hard Mode"
      subtitle="Choose how much friction you need before deactivation."
    >
      <ul className="space-y-1.5">
        {HARD_MODE_LEVELS.map((opt) => {
          const checked = props.level === opt.id;
          return (
            <li
              key={opt.id}
              onClick={() => void props.onChange(opt.id)}
              className="flex items-start gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors"
              style={{
                background: checked ? 'var(--bg-active)' : 'transparent',
                border: '1px solid ' + (checked ? 'var(--border-strong)' : 'var(--border)'),
              }}
            >
              <input
                type="radio"
                name="hard-mode"
                checked={checked}
                readOnly
                className="mt-1 shrink-0"
              />
              <div className="flex-1">
                <div className="text-[13.5px] font-medium">{opt.title}</div>
                <div className="text-[12.5px] text-muted mt-0.5">{opt.description}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

// --- Notifications ---

function NotificationsSection(props: {
  notificationsEnabled: boolean;
  weeklySummaryEnabled: boolean;
  onChangeMaster: (v: boolean) => void | Promise<void>;
  onChangeWeekly: (v: boolean) => void | Promise<void>;
}) {
  return (
    <Section
      title="Notifications"
      subtitle="Two transition reminders + an optional Sunday-evening summary. All built from local data."
    >
      <ToggleRow
        label="Enable transition reminders"
        description={
          'Notify you 5 minutes before a free window starts, and 10 minutes before the next block window.'
        }
        checked={props.notificationsEnabled}
        onChange={(v) => void props.onChangeMaster(v)}
      />
      <div className="mt-4">
        <ToggleRow
          label="Weekly summary (Sunday 8 PM)"
          description={
            "A short summary: time saved this week, adherence %, current streak. Doesn't fire if the master toggle is off."
          }
          checked={props.weeklySummaryEnabled}
          onChange={(v) => void props.onChangeWeekly(v)}
        />
      </div>
    </Section>
  );
}

// --- Import / Export ---

function ImportExportSection() {
  const [busy, setBusy] = useState<'export' | 'import' | 'apply' | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [preview, setPreview] = useState<FblockPreview | null>(null);

  const flash = (kind: 'ok' | 'err', text: string) => {
    setMessage({ kind, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const onExport = async () => {
    setBusy('export');
    setMessage(null);
    try {
      const r = await window.blocker.exportSchedule();
      if (r.ok) flash('ok', `Exported to ${r.path}`);
      else if (!r.cancelled) flash('err', r.error ?? 'Export failed.');
    } finally {
      setBusy(null);
    }
  };

  const onImport = async () => {
    setBusy('import');
    setMessage(null);
    try {
      const r = await window.blocker.importSchedule();
      if (r.ok && r.preview) setPreview(r.preview);
      else if (!r.cancelled) flash('err', r.error ?? 'Import failed.');
    } finally {
      setBusy(null);
    }
  };

  const onApply = async () => {
    if (!preview) return;
    setBusy('apply');
    try {
      const r = await window.blocker.applyImportedSchedule(preview);
      if (r.ok) {
        flash('ok', `Applied ${preview.scheduleBlocks.length} block(s) and ${preview.siteGroups.length} group(s).`);
        setPreview(null);
      } else {
        flash('err', r.error ?? 'Apply failed.');
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section
      title="Import / Export"
      subtitle="Share a schedule with someone else, or restore one you saved earlier. .fblock files contain only your site groups and schedule — never stats or Hard Mode settings."
    >
      <div className="flex flex-wrap gap-2">
        <button onClick={onExport} disabled={busy !== null} className="btn">
          {busy === 'export' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Export schedule…
        </button>
        <button onClick={onImport} disabled={busy !== null} className="btn">
          {busy === 'import' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Import schedule…
        </button>
      </div>
      {message && (
        <p
          className="text-[12px] mt-3"
          style={{ color: message.kind === 'ok' ? 'var(--success)' : 'var(--danger)' }}
        >
          {message.text}
        </p>
      )}

      {preview && (
        <ImportPreviewModal
          preview={preview}
          busy={busy === 'apply'}
          onCancel={() => setPreview(null)}
          onApply={onApply}
        />
      )}
    </Section>
  );
}

function ImportPreviewModal(props: {
  preview: FblockPreview;
  busy: boolean;
  onCancel: () => void;
  onApply: () => void;
}) {
  const { preview } = props;
  const totalSites = preview.siteGroups.reduce((n, g) => n + g.sites.length, 0);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
      <div className="card w-full max-w-lg" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="card-section">
          <h2 className="text-[16px] font-semibold">Replace your current schedule?</h2>
          <p className="text-[12.5px] text-muted mt-1">
            <span className="font-mono">{preview.filename}</span> — exported{' '}
            {new Date(preview.exportedAt).toLocaleString()}
          </p>
        </div>
        <div className="divider" />
        <div className="card-section grid grid-cols-2 gap-3">
          <div
            className="rounded-md p-3"
            style={{ background: 'var(--bg-secondary)' }}
          >
            <div className="text-[11.5px] uppercase tracking-wide text-muted">Site groups</div>
            <div className="text-[20px] font-semibold mt-1.5 leading-none tabular-nums">
              {preview.siteGroups.length}
            </div>
            <div className="text-[12px] text-muted mt-1">{totalSites} sites total</div>
            <ul className="mt-2 text-[12px] text-default space-y-0.5 max-h-32 overflow-y-auto">
              {preview.siteGroups.map((g) => (
                <li key={g.id} className="flex items-baseline justify-between gap-2">
                  <span className="truncate">{g.name}</span>
                  <span className="text-faint shrink-0">{g.sites.length}</span>
                </li>
              ))}
            </ul>
          </div>
          <div
            className="rounded-md p-3"
            style={{ background: 'var(--bg-secondary)' }}
          >
            <div className="text-[11.5px] uppercase tracking-wide text-muted">Schedule blocks</div>
            <div className="text-[20px] font-semibold mt-1.5 leading-none tabular-nums">
              {preview.scheduleBlocks.length}
            </div>
            <div className="text-[12px] text-muted mt-1">total blocks</div>
            <ul className="mt-2 text-[12px] text-default space-y-0.5 max-h-32 overflow-y-auto tabular-nums">
              {preview.scheduleBlocks.slice(0, 8).map((b) => (
                <li key={b.id}>
                  {fmt(b.startMinute)} → {fmt(b.endMinute)}{' '}
                  <span className="text-faint">({b.days.length}d)</span>
                </li>
              ))}
              {preview.scheduleBlocks.length > 8 && (
                <li className="text-faint">+ {preview.scheduleBlocks.length - 8} more</li>
              )}
            </ul>
          </div>
        </div>
        <div className="divider" />
        <div className="card-section py-3">
          <p className="text-[12px] text-muted leading-relaxed">
            This <strong className="text-default">replaces</strong> your current site groups and
            schedule. Stats, Hard Mode, and your other preferences stay as-is. Blocking will be
            switched off so you can review the imported schedule before re-activating.
          </p>
        </div>
        <div className="divider" />
        <div className="card-section py-3 flex justify-end gap-2">
          <button onClick={props.onCancel} disabled={props.busy} className="btn">Cancel</button>
          <button onClick={props.onApply} disabled={props.busy} className="btn btn-primary">
            {props.busy ? <Loader2 size={14} className="animate-spin" /> : null}
            Replace schedule
          </button>
        </div>
      </div>
    </div>
  );
}

function fmt(m: number): string {
  const h = Math.floor(m / 60).toString().padStart(2, '0');
  const mm = (m % 60).toString().padStart(2, '0');
  return `${h}:${mm}`;
}

function BrowserDnsButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await window.blocker.openBrowserDnsPage();
      if (!r.ok) setError(r.error ?? 'Could not open browser.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button onClick={onClick} disabled={busy} className="btn">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
        Clear browser cache
      </button>
      {error && <p className="text-[12px] mt-2" style={{ color: 'var(--danger)' }}>{error}</p>}
    </>
  );
}

function FlushDnsButton() {
  const [busy, setBusy] = useState(false);
  const [flashed, setFlashed] = useState<'ok' | 'fail' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFlush = async () => {
    setBusy(true);
    setError(null);
    setFlashed(null);
    try {
      const r = await window.blocker.flushDnsNow();
      setFlashed(r.ok ? 'ok' : 'fail');
      if (!r.ok) setError(r.error ?? 'Flush failed.');
      setTimeout(() => setFlashed(null), 1800);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button onClick={onFlush} disabled={busy} className="btn">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        {flashed === 'ok' ? 'Flushed' : flashed === 'fail' ? 'Failed' : 'Flush network caches'}
      </button>
      {error && <p className="text-[12px] mt-2" style={{ color: 'var(--danger)' }}>{error}</p>}
    </>
  );
}

function ServiceSection() {
  const [state, setState] = useState<ServiceState | null>(null);
  const [busy, setBusy] = useState<'install' | 'uninstall' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState(false);

  const refresh = async () => {
    try {
      const next = await window.blocker.getServiceState();
      setState(next);
    } catch {
      setState({ installed: false, running: false });
    }
  };

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 4_000);
    return () => clearInterval(t);
  }, []);

  const onInstall = async () => {
    setBusy('install');
    setError(null);
    try {
      const r = await window.blocker.installService();
      if (!r.ok) setError(r.error ?? 'Install failed.');
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const onUninstall = async () => {
    setBusy('uninstall');
    setError(null);
    try {
      const r = await window.blocker.uninstallService();
      if (!r.ok) setError(r.error ?? 'Uninstall failed.');
      await refresh();
    } finally {
      setBusy(null);
      setConfirmUninstall(false);
    }
  };

  return (
    <Section
      title="Background service"
      subtitle="Required for blocking. Installs once with a single UAC prompt, then starts automatically on boot and keeps blocking even when the app is closed."
    >
      <div className="flex items-center gap-3">
        <StatusPill state={state} />
        <div className="flex-1" />
        {state?.installed ? (
          <button
            onClick={() => setConfirmUninstall(true)}
            disabled={busy !== null}
            className="btn"
          >
            <Trash2 size={14} />
            {busy === 'uninstall' ? 'Uninstalling…' : 'Uninstall'}
          </button>
        ) : (
          <button onClick={onInstall} disabled={busy !== null} className="btn btn-primary">
            {busy === 'install' ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            {busy === 'install' ? 'Installing…' : 'Install'}
          </button>
        )}
      </div>
      {error && (
        <p className="text-[12px] mt-3" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      <ConfirmDialog
        open={confirmUninstall}
        title="Uninstall the background service?"
        message="The service will be removed and the hosts file region will be cleaned. Blocking will stop until you reinstall the service."
        confirmLabel="Uninstall"
        destructive
        onConfirm={onUninstall}
        onCancel={() => setConfirmUninstall(false)}
      />
    </Section>
  );
}

function StatusPill(props: { state: ServiceState | null }) {
  if (!props.state) {
    return <span className="chip text-muted">Checking…</span>;
  }
  if (!props.state.installed) {
    return (
      <span className="chip" style={{ color: 'var(--text-muted)' }}>
        <ShieldOff size={12} /> Not installed
      </span>
    );
  }
  if (props.state.running) {
    return (
      <span
        className="chip"
        style={{ background: 'var(--success-soft)', color: 'var(--success)', borderColor: 'transparent' }}
      >
        <ShieldCheck size={12} /> Installed · running
      </span>
    );
  }
  return (
    <span
      className="chip"
      style={{ background: 'var(--warning-soft)', color: 'var(--warning)', borderColor: 'transparent' }}
    >
      <ShieldCheck size={12} /> Installed · idle
    </span>
  );
}

function Section(props: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="card-section">
        <div className="text-[14.5px] font-semibold">{props.title}</div>
        {props.subtitle && <p className="text-[12.5px] text-muted mt-0.5">{props.subtitle}</p>}
        <div className="mt-3.5">{props.children}</div>
      </div>
    </section>
  );
}

function ToggleRow(props: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-3 cursor-pointer">
      <div>
        <div className="text-[13.5px] font-medium">{props.label}</div>
        {props.description && <div className="text-[12px] text-muted mt-0.5">{props.description}</div>}
      </div>
      <Switch checked={props.checked} onChange={props.onChange} />
    </label>
  );
}

function Switch(props: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      onClick={() => props.onChange(!props.checked)}
      className="relative h-5 w-9 rounded-full transition-colors shrink-0"
      style={{
        background: props.checked ? 'var(--accent)' : 'var(--bg-active)',
      }}
    >
      <span
        className="absolute top-0.5 h-4 w-4 rounded-full transition-transform"
        style={{
          background: '#fff',
          transform: props.checked ? 'translateX(18px)' : 'translateX(2px)',
          boxShadow: 'var(--shadow-sm)',
        }}
      />
    </button>
  );
}

function levelColour(level: 'info' | 'warn' | 'error') {
  return level === 'error' ? 'var(--danger)' : level === 'warn' ? 'var(--warning)' : 'var(--text)';
}
