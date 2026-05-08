import { useEffect, useState } from 'react';
import { Bug, ExternalLink, FolderOpen, Globe, Loader2, RefreshCw, RotateCcw, ShieldAlert, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import { useConfig } from '../hooks/useConfig';
import { useAdminState } from '../hooks/useAdminState';
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

      <AdminSection />

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

      <ServiceSection />

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

function AdminSection() {
  const adminState = useAdminState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onRelaunch = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await window.blocker.relaunchAsAdmin();
      if (!r.ok) {
        setError(r.error ?? 'Failed to elevate.');
        setBusy(false);
      }
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setBusy(false);
    }
  };

  if (adminState === null) {
    return (
      <Section title="Permissions">
        <span className="text-[12.5px] text-muted">Checking…</span>
      </Section>
    );
  }

  if (adminState.isAdmin) {
    return (
      <Section
        title="Permissions"
        subtitle="Focus Blocker has the rights it needs to edit your hosts file directly."
      >
        <span
          className="chip"
          style={{ background: 'var(--success-soft)', color: 'var(--success)', borderColor: 'transparent' }}
        >
          <ShieldCheck size={12} /> Running with administrator
        </span>
      </Section>
    );
  }

  return (
    <Section
      title="Permissions"
      subtitle="Focus Blocker needs admin rights once to edit C:\Windows\System32\drivers\etc\hosts. After that it just works."
    >
      <div className="flex items-center gap-3">
        <span
          className="chip"
          style={{ background: 'var(--warning-soft)', color: 'var(--warning)', borderColor: 'transparent' }}
        >
          <ShieldAlert size={12} /> Running without administrator
        </span>
        <div className="flex-1" />
        <button onClick={onRelaunch} disabled={busy} className="btn btn-primary">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          {busy ? 'Relaunching…' : 'Restart with admin'}
        </button>
      </div>
      {error && (
        <p className="text-[12px] mt-3" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
    </Section>
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
      title="Advanced: background service"
      subtitle="Optional. Registers a Windows Service so blocking persists when the app is fully closed. Most users don't need this — relaunching with admin (above) is simpler."
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
        message="The service will be removed and the hosts file region will be cleaned. Blocking will stop unless you run the app as administrator."
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
