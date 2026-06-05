import { useState } from 'react';
import { Plus, X, Monitor } from 'lucide-react';
import { useConfig } from '../hooks/useConfig';

const PROCESS_NAME_RE = /^[a-zA-Z0-9_\-]+\.exe$/i;

export function ApplicationsPage() {
  const { config, update } = useConfig();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!config) return <div className="card card-section text-[13px] text-muted">Loading…</div>;

  const apps = config.blockedApplications ?? [];

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

      <div className="card">
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
                Add executable names below to block them during schedule blocks.
              </p>
              <p className="text-[12px] text-faint mt-3">
                Examples: <span className="kbd">steam.exe</span> <span className="kbd">vlc.exe</span> <span className="kbd">discord.exe</span> <span className="kbd">cs2.exe</span>
              </p>
            </div>
          )}
        </div>
        <div className="divider" />
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
          {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
        </div>
      </div>

      <div className="card card-section text-[12.5px] text-muted leading-relaxed space-y-2">
        <p>
          Applications are identified by their process name (the <span className="kbd">.exe</span> filename).
          The background service will detect and terminate matching processes during any schedule block
          that has "Block applications" enabled.
        </p>
        <p>
          Tip: open Task Manager to find the exact process name for an application you want to block.
        </p>
      </div>
    </div>
  );
}
