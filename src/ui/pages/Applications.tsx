import { useState } from 'react';
import { ArrowRight, Plus, X, Monitor } from 'lucide-react';
import { useConfig } from '../hooks/useConfig';
import { PageLoader } from '../components/PageLoader';
import type { Route } from '../components/Sidebar';

const PROCESS_NAME_RE = /^[a-zA-Z0-9_\-]+\.exe$/i;

export function ApplicationsPage(props: { onNavigate?: (r: Route) => void }) {
  const { config, update } = useConfig();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!config) return <PageLoader />;

  const apps = config.blockedApplications ?? [];
  const hasBlockWithApps = config.scheduleBlocks.some((b) => b.blockApplications);

  const addApp = () => {
    const cleaned = draft.trim().toLowerCase();
    if (!cleaned) return;
    if (!PROCESS_NAME_RE.test(cleaned)) {
      setError("Enter a valid process name like 'steam.exe' (letters, numbers, hyphens, underscores, ending in .exe).");
      return;
    }
    if (apps.some((a) => a.toLowerCase() === cleaned)) {
      setError('This application is already in the list.');
      return;
    }
    void update((d) => {
      if (!d.blockedApplications) d.blockedApplications = [];
      d.blockedApplications.push(cleaned);
      d.blockedApplications.sort();
    });
    setDraft('');
    setError(null);
  };

  const removeApp = (name: string) => {
    void update((d) => {
      d.blockedApplications = (d.blockedApplications ?? []).filter((a) => a !== name);
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-default">Applications</h1>
          <p className="text-[13.5px] text-muted mt-0.5">
            Block desktop applications during active schedule blocks.
          </p>
        </div>
        <span className="chip text-muted"><Monitor size={12} /> {apps.length} app{apps.length === 1 ? '' : 's'}</span>
      </div>

      {apps.length > 0 && !hasBlockWithApps && config.scheduleBlocks.length > 0 && (
        <div
          className="card card-section flex items-center justify-between"
          style={{ background: 'var(--warning-soft)', borderColor: 'transparent' }}
        >
          <div className="text-[12.5px]" style={{ color: 'var(--warning)' }}>
            Your schedule blocks do not have &quot;Block applications&quot; enabled. Apps in this list will not be blocked until a block has that option turned on.
          </div>
          {props.onNavigate && (
            <button
              onClick={() => props.onNavigate!('schedule')}
              className="btn ml-3 shrink-0"
              style={{ background: 'var(--warning)', color: '#fff' }}
            >
              <ArrowRight size={14} /> View schedule
            </button>
          )}
        </div>
      )}

      {apps.length > 0 && config.scheduleBlocks.length === 0 && (
        <div
          className="card card-section flex items-center justify-between"
          style={{ background: 'var(--warning-soft)', borderColor: 'transparent' }}
        >
          <div className="text-[12.5px]" style={{ color: 'var(--warning)' }}>
            You have blocked applications but no schedule blocks yet. Applications are only blocked during an active schedule block.
          </div>
          {props.onNavigate && (
            <button
              onClick={() => props.onNavigate!('schedule')}
              className="btn ml-3 shrink-0"
              style={{ background: 'var(--warning)', color: '#fff' }}
            >
              <ArrowRight size={14} /> Create schedule
            </button>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-section">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addApp();
            }}
          >
            <input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Add application, e.g. steam.exe"
              className="field flex-1"
            />
            <button type="submit" className="btn btn-primary">
              <Plus size={14} /> Add
            </button>
          </form>
          {error && <p className="mt-2 text-[12px]" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>

        <div className="divider" />
        <div className="card-section">
          {apps.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {apps.map((app) => (
                <li key={app} className="chip">
                  <span>{app}</span>
                  <button
                    onClick={() => removeApp(app)}
                    aria-label={`Remove ${app}`}
                    className="text-faint hover:text-default"
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-8">
              <div className="text-[15px] font-medium">No blocked applications</div>
              <p className="text-[13px] text-muted mt-1">
                Add executable names above to block them during schedule blocks.
              </p>
              <p className="text-[12px] text-faint mt-3">
                Examples: <span className="kbd">steam.exe</span> <span className="kbd">vlc.exe</span> <span className="kbd">discord.exe</span> <span className="kbd">cs2.exe</span>
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="card card-section text-[12.5px] text-muted leading-relaxed space-y-2">
        <p>
          Applications are identified by their process name (the <span className="kbd">.exe</span> filename).
          The background service will detect and terminate matching processes during any schedule block
          that has &quot;Block applications&quot; enabled.
        </p>
        <p>
          Tip: open Task Manager to find the exact process name for an application you want to block.
        </p>
      </div>
    </div>
  );
}