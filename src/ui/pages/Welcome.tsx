import { useState } from 'react';
import { ArrowRight, Cog, FileEdit, Lock, Shield } from 'lucide-react';
import { useConfig } from '../hooks/useConfig';

export function WelcomePage(props: { onDone: () => void }) {
  const { config, update } = useConfig();
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!config) return null;

  const finish = async () => {
    setBusy(true);
    try {
      await window.blocker.setAutoLaunch(autoLaunch);
      await update((draft) => {
        draft.preferences.showWelcomeScreen = false;
        draft.preferences.autoLaunchOnBoot = autoLaunch;
      });
      props.onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-2.5rem)] grid place-items-center px-6 py-10">
      <div className="w-full max-w-xl">
        <div
          className="h-12 w-12 rounded-xl grid place-items-center mb-6"
          style={{ background: 'var(--text)', color: 'var(--bg)' }}
        >
          <Shield size={22} strokeWidth={2.25} />
        </div>
        <h1 className="text-[34px] font-semibold tracking-tight leading-tight">
          Welcome to Focus Blocker
        </h1>
        <p className="text-[15px] text-muted mt-3 leading-relaxed">
          Define site groups and a daily schedule. When a window starts, the listed sites
          stop loading until the window ends. Nothing leaves your computer.
        </p>

        <div className="mt-8 grid gap-2">
          <Bullet
            Icon={FileEdit}
            title="Edits a managed region of your hosts file"
            body={
              <>
                Sites are redirected to <code className="kbd">127.0.0.1</code>. Entries outside our
                <code className="kbd">BEGIN</code>/<code className="kbd">END</code> markers are never touched.
              </>
            }
          />
          <Bullet
            Icon={Cog}
            title="Installs a small Windows Service"
            body="The service runs the schedule in the background, even when this app is closed."
          />
          <Bullet
            Icon={Lock}
            title="Stays on your machine"
            body="No accounts, no telemetry, no network calls beyond the local DNS flush."
          />
        </div>

        <label
          className="mt-8 flex items-center justify-between gap-3 px-4 py-3 rounded-md cursor-pointer transition-colors"
          style={{ border: '1px solid var(--border)' }}
        >
          <div>
            <div className="text-[13.5px] font-medium">Open Focus Blocker at sign-in</div>
            <div className="text-[12.5px] text-muted mt-0.5">You can change this any time in Settings.</div>
          </div>
          <input
            type="checkbox"
            checked={autoLaunch}
            onChange={(e) => setAutoLaunch(e.target.checked)}
            className="h-4 w-4"
          />
        </label>

        <div className="mt-8 flex justify-end">
          <button onClick={finish} disabled={busy} className="btn btn-primary h-10 px-5">
            {busy ? 'Working…' : "Got it, let's start"} <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Bullet(props: { Icon: typeof Shield; title: string; body: React.ReactNode }) {
  const { Icon } = props;
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-md" style={{ background: 'var(--bg-secondary)' }}>
      <div
        className="h-7 w-7 grid place-items-center rounded-md shrink-0 mt-0.5"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
      >
        <Icon size={14} />
      </div>
      <div>
        <div className="text-[13.5px] font-medium">{props.title}</div>
        <div className="text-[12.5px] text-muted mt-0.5 leading-relaxed">{props.body}</div>
      </div>
    </div>
  );
}
