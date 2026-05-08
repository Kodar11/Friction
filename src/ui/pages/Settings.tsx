import { useEffect, useState } from 'react';
import { ExternalLink, RotateCcw, Bug, FolderOpen } from 'lucide-react';
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

      <Section title="Recovery" subtitle="Removes only the focus-blocker region between our markers; entries outside are untouched.">
        <button onClick={() => setConfirmRestore(true)} disabled={restoring} className="btn">
          <RotateCcw size={14} /> {restoring ? 'Restoring…' : 'Restore hosts file'}
        </button>
      </Section>

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
